const fs = require("fs");
const https = require("https");
const { URL } = require("url");

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectedUrl = new URL(res.headers.location, url).toString();
        return resolve(fetchJson(redirectedUrl));
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Erro HTTP ${res.statusCode} ao acessar ${url}`));
      }

      let raw = "";
      res.on("data", chunk => raw += chunk);
      res.on("end", () => {
        try {
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(new Error(`Erro ao parsear JSON de ${url}: ${err.message}`));
        }
      });
    });

    request.on("error", reject);
  });
}

function loadServers() {
  const path = "servidores.json";
  if (!fs.existsSync(path)) {
    return [
      { url: "https://archive.org/metadata/ps3_jogos" }
    ];
  }

  const raw = fs.readFileSync(path, "utf8").trim();
  if (!raw) {
    throw new Error(`${path} está vazio`);
  }

  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error(`${path} deve ser um array de URLs ou objetos { url, name }`);
  }

  return data.map(item => {
    if (typeof item === "string") {
      return { url: item };
    }

    if (item && typeof item.url === "string") {
      return item;
    }

    throw new Error("Formato inválido em servidores.json. Use [\"url\"] ou [{ url, name }].");
  });
}

function uniqueByName(items) {
  const seen = new Set();
  return items.filter(item => {
    const name = item && item.name && item.name.toLowerCase();
    if (!name || seen.has(name)) {
      return false;
    }
    seen.add(name);
    return true;
  });
}

async function gerar() {
  const servers = loadServers();
  if (servers.length === 0) {
    throw new Error("Nenhum servidor configurado em servidores.json");
  }

  const allFiles = [];

  for (const server of servers) {
    const label = server.name || server.url;
    console.log(`Buscando: ${label}`);

    try {
      const data = await fetchJson(server.url);
      const files = Array.isArray(data.files) ? data.files : [];
      console.log(`Total arquivos de ${label}:`, files.length);
      allFiles.push(...files);
    } catch (err) {
      console.error(`Falha ao buscar ${label}:`, err.message);
    }
  }

  if (allFiles.length === 0) {
    throw new Error("Nenhum arquivo obtido dos servidores configurados");
  }

  const filtrados = allFiles.filter(f =>
    f.name && f.name.toLowerCase().includes(".pkg")
  );

  const unicos = uniqueByName(filtrados);

  console.log("PKG filtrados:", filtrados.length);
  console.log("PKG únicos gravados:", unicos.length);

  fs.writeFileSync("jogos.json", JSON.stringify(unicos, null, 2));
  console.log("jogos.json atualizado");
}

gerar().catch(err => {
  console.error(err);
  process.exit(1);
});
