const fs = require("fs");
const http = require("http");
const https = require("https");
const { URL } = require("url");

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === "http:" ? http : https;

    const request = client.get(parsedUrl, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectedUrl = new URL(res.headers.location, parsedUrl).toString();
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

function normalizeServer(item) {
  if (typeof item === "string") {
    return { url: item };
  }

  if (item && typeof item.url === "string") {
    return item;
  }

  throw new Error("Formato inválido em servidores.json. Use [\"url\"] ou [{ url, name, downloadBase, rootPlatform }].");
}

function loadServers() {
  const path = "servidores.json";
  if (!fs.existsSync(path)) {
    return [normalizeServer("https://archive.org/metadata/ps3_jogos")];
  }

  const raw = fs.readFileSync(path, "utf8").trim();
  if (!raw) {
    throw new Error(`${path} está vazio`);
  }

  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error(`${path} deve ser um array de URLs ou objetos { url, name, downloadBase, rootPlatform }`);
  }

  return data.map(normalizeServer);
}

function inferPlatform(server, file) {
  if (server.rootPlatform) {
    return server.rootPlatform.toUpperCase();
  }

  if (!file || !file.name) {
    return null;
  }

  const name = file.name.toUpperCase();
  if (name.startsWith("PS1/")) return "PS1";
  if (name.startsWith("PS2/")) return "PS2";
  if (name.startsWith("PS3/")) return "PS3";
  return null;
}

function archiveDownloadBaseFromMetadataUrl(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const metadataIndex = parts.indexOf("metadata");
    if (metadataIndex !== -1 && metadataIndex < parts.length - 1) {
      const collection = parts[metadataIndex + 1];
      return `https://archive.org/download/${collection}`;
    }
  } catch (err) {
    // ignore
  }
  return null;
}

function pathEncodeSegments(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function buildDownloadUrl(server, file) {
  if (file.download_url) {
    return file.download_url;
  }
  if (server.downloadBase) {
    return `${server.downloadBase}/${pathEncodeSegments(file.name)}`;
  }

  const archiveBase = archiveDownloadBaseFromMetadataUrl(server.url);
  if (archiveBase) {
    return `${archiveBase}/${pathEncodeSegments(file.name)}`;
  }

  return file.name;
}

function uniqueByUrl(items) {
  const seen = new Set();
  return items.filter(item => {
    const url = item && item.download_url;
    if (!url || seen.has(url)) {
      return false;
    }
    seen.add(url);
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

      const enriched = files.map(file => ({
        ...file,
        download_url: buildDownloadUrl(server, file),
        platform: inferPlatform(server, file),
        server: server.name || server.url
      }));

      allFiles.push(...enriched);
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
  const unicos = uniqueByUrl(filtrados);

  console.log("PKG filtrados:", filtrados.length);
  console.log("PKG únicos gravados:", unicos.length);

  fs.writeFileSync("jogos.json", JSON.stringify(unicos, null, 2));
  console.log("jogos.json atualizado");
}

gerar().catch(err => {
  console.error(err);
  process.exit(1);
});
