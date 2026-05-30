const fs = require("fs");

async function gerar() {

    console.log("Buscando Internet Archive...");

    const response = await fetch(
        "https://archive.org/metadata/ps3_jogos"
    );

    if (!response.ok) {
        throw new Error("Erro HTTP " + response.status);
    }

    const data = await response.json();

    const files = data.files || [];

    console.log("Total arquivos:", files.length);

    // opcional: filtrar só PKG
    const filtrados = files.filter(f =>
        f.name && f.name.toLowerCase().includes(".pkg")
    );

    console.log("PKG filtrados:", filtrados.length);

    fs.writeFileSync(
        "jogos.json",
        JSON.stringify(filtrados, null, 2)
    );

    console.log("jogos.json atualizado");
}

gerar().catch(err => {
    console.error(err);
    process.exit(1);
});