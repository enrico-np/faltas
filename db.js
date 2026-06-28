/*
 * Camada de dados — IndexedDB (banco local do navegador, vive no celular).
 *
 * É o equivalente JS do antigo db.py. A interface (app.js) nunca mexe no
 * IndexedDB direto: chama as funções daqui. Toda função é assíncrona (Promise),
 * porque IndexedDB é assíncrono por natureza.
 *
 * Estrutura (3 "object stores", equivalentes às 3 tabelas):
 *   turmas:  { id, nome }
 *   alunos:  { id, nome, turmaId }
 *   faltas:  { id, alunoId, data }   // data em 'YYYY-MM-DD'
 */

const DB_NAME = "controle_faltas";
const DB_VERSION = 1;

let _db = null;

// Abre (e cria, na primeira vez) o banco. Memoiza a conexão.
function abrir() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    // Só roda quando o banco é criado ou a versão muda: aqui criamos os stores.
    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains("turmas")) {
        db.createObjectStore("turmas", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("alunos")) {
        const s = db.createObjectStore("alunos", { keyPath: "id", autoIncrement: true });
        s.createIndex("turmaId", "turmaId", { unique: false });
      }
      if (!db.objectStoreNames.contains("faltas")) {
        const s = db.createObjectStore("faltas", { keyPath: "id", autoIncrement: true });
        s.createIndex("alunoId", "alunoId", { unique: false });
        // índice composto p/ impedir falta duplicada (mesmo aluno, mesma data)
        s.createIndex("aluno_data", ["alunoId", "data"], { unique: true });
      }
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

// Helper: roda uma transação e devolve uma Promise.
async function tx(stores, mode, fn) {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let resultado;
    t.oncomplete = () => resolve(resultado);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("transação abortada"));
    // fn recebe os object stores e pode setar `resultado` via retorno
    Promise.resolve(fn(t)).then((r) => { resultado = r; });
  });
}

// Converte um cursor/getAll callback em Promise simples.
function promisificar(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ----------------------------- TURMAS ----------------------------- */

async function listarTurmas() {
  return tx("turmas", "readonly", (t) =>
    promisificar(t.objectStore("turmas").getAll())
  ).then((arr) => arr.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
}

async function criarTurma(nome) {
  nome = nome.trim();
  if (!nome) return;
  const existentes = await listarTurmas();
  if (existentes.some((t) => t.nome.toLowerCase() === nome.toLowerCase())) return;
  return tx("turmas", "readwrite", (t) =>
    promisificar(t.objectStore("turmas").add({ nome }))
  );
}

/* ----------------------------- ALUNOS ----------------------------- */

async function listarAlunos(turmaId) {
  const arr = await tx("alunos", "readonly", (t) =>
    promisificar(t.objectStore("alunos").index("turmaId").getAll(turmaId))
  );
  return arr.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/*
 * Substitui a lista de alunos da turma pela lista `nomes`.
 * Preserva quem continua (e portanto suas faltas); remove quem saiu
 * (apagando faltas em cascata, feito manualmente); insere os novos.
 */
async function substituirAlunosDaTurma(turmaId, nomes) {
  const limpos = [...new Set(nomes.map((n) => n.trim()).filter(Boolean))];
  const atuais = await listarAlunos(turmaId);
  const nomesAtuais = new Set(atuais.map((a) => a.nome));
  const nomesNovos = new Set(limpos);

  const aRemover = atuais.filter((a) => !nomesNovos.has(a.nome));
  const aInserir = limpos.filter((n) => !nomesAtuais.has(n));

  // remove faltas dos alunos que saíram, depois os próprios alunos
  for (const aluno of aRemover) {
    await _removerFaltasDoAluno(aluno.id);
  }
  return tx("alunos", "readwrite", (t) => {
    const store = t.objectStore("alunos");
    for (const aluno of aRemover) store.delete(aluno.id);
    for (const nome of aInserir) store.add({ nome, turmaId });
  });
}

async function _removerFaltasDoAluno(alunoId) {
  return tx("faltas", "readwrite", async (t) => {
    const idx = t.objectStore("faltas").index("alunoId");
    const chaves = await promisificar(idx.getAllKeys(alunoId));
    const store = t.objectStore("faltas");
    for (const k of chaves) store.delete(k);
  });
}

/* ----------------------------- FALTAS ----------------------------- */

/* Registra falta na `dataISO` (YYYY-MM-DD) para cada id em alunoIds.
 * Duplicatas são ignoradas (índice único aluno_data). */
async function registrarFaltas(alunoIds, dataISO) {
  return tx("faltas", "readwrite", (t) => {
    const store = t.objectStore("faltas");
    for (const alunoId of alunoIds) {
      const req = store.add({ alunoId, data: dataISO });
      // engole o erro de duplicata para não abortar a transação inteira
      req.onerror = (e) => { e.preventDefault(); e.stopPropagation(); };
    }
  });
}

/* Remove uma falta específica (aluno + data). Usado p/ corrigir erros. */
async function removerFalta(alunoId, dataISO) {
  return tx("faltas", "readwrite", async (t) => {
    const idx = t.objectStore("faltas").index("aluno_data");
    const chave = await promisificar(idx.getKey([alunoId, dataISO]));
    if (chave !== undefined) t.objectStore("faltas").delete(chave);
  });
}

/* Datas em que um aluno faltou (para mostrar e permitir remover). */
async function datasDeFalta(alunoId) {
  const arr = await tx("faltas", "readonly", (t) =>
    promisificar(t.objectStore("faltas").index("alunoId").getAll(alunoId))
  );
  return arr.map((f) => f.data).sort();
}

/*
 * Conta faltas por aluno da turma no semestre/ano.
 * Regra de semestre (definida pelo usuário):
 *   1º semestre: 01/01 a 15/07
 *   2º semestre: 16/07 a 31/12
 * Alunos com zero faltas também aparecem (com 0).
 */
async function faltasPorAluno(turmaId, ano, semestre) {
  const ini = semestre === 1 ? `${ano}-01-01` : `${ano}-07-16`;
  const fim = semestre === 1 ? `${ano}-07-15` : `${ano}-12-31`;

  const alunos = await listarAlunos(turmaId);
  const resultado = [];
  for (const aluno of alunos) {
    const datas = await datasDeFalta(aluno.id);
    const total = datas.filter((d) => d >= ini && d <= fim).length;
    resultado.push({ nome: aluno.nome, alunoId: aluno.id, totalFaltas: total });
  }
  resultado.sort(
    (a, b) => b.totalFaltas - a.totalFaltas || a.nome.localeCompare(b.nome, "pt-BR")
  );
  return resultado;
}

/* Anos que têm ao menos uma falta, para popular o seletor. */
async function anosComRegistro() {
  const todas = await tx("faltas", "readonly", (t) =>
    promisificar(t.objectStore("faltas").getAll())
  );
  const anos = [...new Set(todas.map((f) => f.data.slice(0, 4)))].map(Number);
  return anos.sort((a, b) => b - a);
}

/* ----------------------------- BACKUP ----------------------------- */

/* Exporta todo o banco para um objeto JSON (para salvar como arquivo). */
async function exportarTudo() {
  const [turmas, alunos, faltas] = await Promise.all([
    tx("turmas", "readonly", (t) => promisificar(t.objectStore("turmas").getAll())),
    tx("alunos", "readonly", (t) => promisificar(t.objectStore("alunos").getAll())),
    tx("faltas", "readonly", (t) => promisificar(t.objectStore("faltas").getAll())),
  ]);
  return { versao: 1, exportadoEm: new Date().toISOString(), turmas, alunos, faltas };
}

/* Importa um backup, SUBSTITUINDO os dados atuais. */
async function importarTudo(dados) {
  if (!dados || !dados.turmas) throw new Error("Arquivo de backup inválido.");
  await tx(["turmas", "alunos", "faltas"], "readwrite", (t) => {
    t.objectStore("turmas").clear();
    t.objectStore("alunos").clear();
    t.objectStore("faltas").clear();
    for (const x of dados.turmas) t.objectStore("turmas").add(x);
    for (const x of dados.alunos) t.objectStore("alunos").add(x);
    for (const x of dados.faltas) t.objectStore("faltas").add(x);
  });
}

window.DB = {
  listarTurmas, criarTurma,
  listarAlunos, substituirAlunosDaTurma,
  registrarFaltas, removerFalta, datasDeFalta,
  faltasPorAluno, anosComRegistro,
  exportarTudo, importarTudo,
};
