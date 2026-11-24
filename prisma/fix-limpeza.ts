import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

const ALVO = resolve("src/foods/foods.service.ts");
const BLOCO = resolve("prisma/limpeza-block.txt");

const src = readFileSync(ALVO, "utf8");
const bloco = readFileSync(BLOCO, "utf8");

const iLimpeza = src.indexOf("// LIMPEZA DE NOME PARA EXIBIÇÃO");
const iService = src.indexOf("// SERVICE");

if (iLimpeza < 0 || iService < 0) {
  throw new Error("Marcadores não encontrados. Abortando sem alterar o arquivo.");
}
if (iService < iLimpeza) {
  throw new Error("Ordem dos marcadores invertida. Abortando.");
}

const inicio = src.lastIndexOf("// ====", iLimpeza);
const fim = src.lastIndexOf("// ====", iService);

if (inicio < 0 || fim < 0 || fim <= inicio) {
  throw new Error("Não consegui delimitar o trecho. Abortando.");
}

const novo = src.slice(0, inicio) + bloco.trimEnd() + "\n\n" + src.slice(fim);

const abre = (novo.match(/\{/g) ?? []).length;
const fecha = (novo.match(/\}/g) ?? []).length;
const defs = (novo.match(/export function limparNomeCompleto/g) ?? []).length;

console.log(`chaves: ${abre} abrem / ${fecha} fecham`);
console.log(`limparNomeCompleto: ${defs} definição(ões)`);

if (abre !== fecha) {
  throw new Error("Desbalanceado. Nada foi gravado.");
}
if (defs !== 1) {
  throw new Error("Definição duplicada ou ausente. Nada foi gravado.");
}

copyFileSync(ALVO, ALVO + ".bak");
writeFileSync(ALVO, novo, "utf8");
console.log("Arquivo corrigido. Backup em foods.service.ts.bak");