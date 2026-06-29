/*
 * Interface — liga os widgets do index.html às funções de DB (db.js).
 * Nenhum acesso direto ao IndexedDB aqui: tudo via window.DB.
 */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

/* ---------- toast ---------- */
let _toastTimer;
function toast(msg, erro = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.toggle("erro", erro);
  el.classList.add("mostra");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove("mostra"), 2600);
}

/* ---------- abas ---------- */
$$('nav.tabs button').forEach((btn) => {
  btn.addEventListener("click", () => {
    $$('nav.tabs button').forEach((b) => b.setAttribute("aria-selected", "false"));
    btn.setAttribute("aria-selected", "true");
    $$(".panel").forEach((p) => p.classList.remove("ativo"));
    $("#" + btn.dataset.alvo).classList.add("ativo");
    // recarrega o conteúdo da aba ao entrar
    if (btn.dataset.alvo === "p-faltas") renderChamada();
    if (btn.dataset.alvo === "p-dados") renderDados();
  });
});

/* Preenche um <select> de turmas. Retorna o array de turmas. */
async function preencherSelectsTurma() {
  const turmas = await DB.listarTurmas();
  for (const sel of ["#sel-turma-edit", "#sel-turma-falta", "#sel-turma-view"]) {
    const el = $(sel);
    const anterior = el.value;
    el.innerHTML = "";
    if (turmas.length === 0) {
      const o = document.createElement("option");
      o.textContent = "— nenhuma turma —";
      o.value = "";
      el.appendChild(o);
    } else {
      for (const t of turmas) {
        const o = document.createElement("option");
        o.value = t.id; o.textContent = t.nome;
        el.appendChild(o);
      }
      if ([...el.options].some((o) => o.value === anterior)) el.value = anterior;
    }
  }
  await renderTabelaTurmas(turmas);
  return turmas;
}

// mini-tabela de turmas: nome editável + excluir
async function renderTabelaTurmas(turmas) {
  if (!turmas) turmas = await DB.listarTurmas();
  const bloco = $("#bloco-turmas");
  const tabela = $("#tabela-turmas");
  if (turmas.length === 0) { bloco.hidden = true; tabela.innerHTML = ""; return; }
  bloco.hidden = false;
  tabela.innerHTML = "";

  for (const turma of turmas) {
    const row = document.createElement("div");
    row.className = "aluno-edit";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "nome-edit";
    input.value = turma.nome;
    input.dataset.id = turma.id;
    input.dataset.original = turma.nome;
    input.addEventListener("blur", () => salvarRenomeTurma(input));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); input.blur(); }
    });

    const btn = document.createElement("button");
    btn.className = "btn-excluir-aluno";
    btn.textContent = "×";
    btn.title = "Excluir turma";
    btn.addEventListener("click", () => excluirTurmaUI(turma));

    row.appendChild(input);
    row.appendChild(btn);
    tabela.appendChild(row);
  }
}

// renomeia uma turma (preserva alunos e faltas, pois é pelo id)
async function salvarRenomeTurma(input) {
  const id = Number(input.dataset.id);
  const novo = input.value.trim();
  const original = input.dataset.original;
  if (novo === original) return;
  if (!novo) {
    input.value = original;
    toast("O nome da turma não pode ficar vazio.", true);
    return;
  }
  const ok = await DB.renomearTurma(id, novo);
  if (ok) {
    input.dataset.original = novo;
    toast("Turma renomeada.");
    await preencherSelectsTurma();   // atualiza os seletores das outras abas
    await carregarEditorAlunos();
  } else {
    input.value = original;
    toast("Já existe uma turma com esse nome.", true);
  }
}

// exclui turma exigindo digitar o nome (confirmação reforçada)
async function excluirTurmaUI(turma) {
  const alunos = await DB.listarAlunos(turma.id);
  const aviso = alunos.length > 0
    ? `Isto vai apagar a turma "${turma.nome}", seus ${alunos.length} aluno(s) e todas as faltas registrados.`
    : `Isto vai apagar a turma "${turma.nome}".`;
  const digitado = prompt(`${aviso}\n\nPara confirmar, digite o nome da turma:`);
  if (digitado === null) return; // cancelou
  if (digitado.trim() !== turma.nome) {
    toast("Nome não confere. Exclusão cancelada.", true);
    return;
  }
  await DB.excluirTurma(turma.id);
  toast(`Turma "${turma.nome}" excluída.`);
  await preencherSelectsTurma();
  await carregarEditorAlunos();
}

/* ===================== TURMAS ===================== */

$("#btn-criar-turma").addEventListener("click", async () => {
  const nome = $("#nova-turma").value;
  if (!nome.trim()) { toast("Digite um nome de turma.", true); return; }
  await DB.criarTurma(nome);
  $("#nova-turma").value = "";
  await preencherSelectsTurma();
  $("#sel-turma-edit").value =
    [...$("#sel-turma-edit").options].find((o) => o.textContent === nome.trim())?.value || "";
  await carregarEditorAlunos();
  toast(`Turma "${nome.trim()}" criada.`);
});

async function carregarEditorAlunos() {
  const turmaId = Number($("#sel-turma-edit").value);
  const bloco = $("#bloco-editor");
  if (!turmaId) { bloco.hidden = true; return; }
  bloco.hidden = false;

  const alunos = await DB.listarAlunos(turmaId);
  const tabela = $("#tabela-alunos");
  tabela.innerHTML = "";

  if (alunos.length === 0) {
    tabela.innerHTML = '<p class="vazio-tabela">Nenhum aluno ainda. Adicione abaixo.</p>';
    return;
  }

  for (const aluno of alunos) {
    const row = document.createElement("div");
    row.className = "aluno-edit";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "nome-edit";
    input.value = aluno.nome;
    input.dataset.id = aluno.id;
    input.dataset.original = aluno.nome;
    // salva ao sair do campo ou apertar Enter
    input.addEventListener("blur", () => salvarRenome(input));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); input.blur(); }
    });

    const btn = document.createElement("button");
    btn.className = "btn-excluir-aluno";
    btn.textContent = "×";
    btn.title = "Excluir aluno";
    btn.addEventListener("click", () => excluirAluno(aluno));

    row.appendChild(input);
    row.appendChild(btn);
    tabela.appendChild(row);
  }
}

// salva o novo nome de um aluno (renomear preserva as faltas)
async function salvarRenome(input) {
  const id = Number(input.dataset.id);
  const novo = input.value.trim();
  const original = input.dataset.original;
  if (novo === original) return;            // nada mudou
  if (!novo) {                              // vazio: reverte
    input.value = original;
    toast("O nome não pode ficar vazio.", true);
    return;
  }
  const ok = await DB.renomearAluno(id, novo);
  if (ok) {
    input.dataset.original = novo;
    toast("Nome atualizado.");
  } else {
    input.value = original;                 // duplicado: reverte
    toast("Já existe um aluno com esse nome na turma.", true);
  }
}

// exclui um aluno (com confirmação, pois apaga as faltas dele)
async function excluirAluno(aluno) {
  if (!confirm(`Excluir "${aluno.nome}"? As faltas registradas para este aluno também serão apagadas.`)) return;
  await DB.removerAluno(aluno.id);
  toast(`"${aluno.nome}" excluído.`);
  await carregarEditorAlunos();
}

$("#sel-turma-edit").addEventListener("change", carregarEditorAlunos);

// adicionar aluno pelo campo + botão (ou Enter)
async function adicionarAlunoUI() {
  const turmaId = Number($("#sel-turma-edit").value);
  if (!turmaId) return;
  const campo = $("#novo-aluno");
  const nome = campo.value.trim();
  if (!nome) { toast("Digite o nome do aluno.", true); return; }
  const id = await DB.adicionarAluno(turmaId, nome);
  if (id == null) {
    toast("Já existe um aluno com esse nome na turma.", true);
    return;
  }
  campo.value = "";
  await carregarEditorAlunos();
  campo.focus();   // pronto para digitar o próximo
}

$("#btn-add-aluno").addEventListener("click", adicionarAlunoUI);
$("#novo-aluno").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); adicionarAlunoUI(); }
});

/* ---------- backup ---------- */
$("#btn-exportar").addEventListener("click", async () => {
  const dados = await DB.exportarTudo();
  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const hoje = new Date().toISOString().slice(0, 10);
  a.href = url; a.download = `faltas-backup-${hoje}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast("Backup exportado.");
});

$("#btn-importar").addEventListener("click", () => $("#arquivo-importar").click());
$("#arquivo-importar").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!confirm("Importar vai SUBSTITUIR todos os dados atuais. Continuar?")) {
    e.target.value = ""; return;
  }
  try {
    const texto = await file.text();
    await DB.importarTudo(JSON.parse(texto));
    await preencherSelectsTurma();
    await carregarEditorAlunos();
    toast("Backup importado.");
  } catch (err) {
    toast("Arquivo inválido: " + err.message, true);
  }
  e.target.value = "";
});

/* ===================== CHAMADA ===================== */

async function renderChamada() {
  const turmaId = Number($("#sel-turma-falta").value);
  const lista = $("#lista-chamada");
  const barra = $("#barra-chamada");
  lista.innerHTML = "";
  if (!turmaId) {
    lista.innerHTML = '<p class="vazio">Selecione uma turma.</p>';
    barra.hidden = true; return;
  }
  const alunos = await DB.listarAlunos(turmaId);
  if (alunos.length === 0) {
    lista.innerHTML = '<p class="vazio">Esta turma não tem alunos. Cadastre na aba Turmas.</p>';
    barra.hidden = true; return;
  }
  for (const aluno of alunos) {
    const row = document.createElement("div");
    row.className = "aluno-row";
    row.innerHTML =
      `<label><input type="checkbox" value="${aluno.id}" /> ${escape(aluno.nome)}</label>`;
    lista.appendChild(row);
  }
  barra.hidden = false;
}

$("#sel-turma-falta").addEventListener("change", renderChamada);

$("#btn-registrar").addEventListener("click", async () => {
  const data = $("#data-falta").value;
  if (!data) { toast("Selecione a data.", true); return; }
  const ids = [...$$('#lista-chamada input:checked')].map((c) => Number(c.value));
  if (ids.length === 0) { toast("Nenhum aluno marcado.", true); return; }
  await DB.registrarFaltas(ids, data);
  $$('#lista-chamada input:checked').forEach((c) => (c.checked = false));
  toast(`${ids.length} falta(s) registrada(s) em ${formatarBR(data)}.`);
});

/* ===================== RELATÓRIO ===================== */

async function popularAnos() {
  const sel = $("#sel-ano");
  const anos = await DB.anosComRegistro();
  const atual = new Date().getFullYear();
  if (!anos.includes(atual)) anos.unshift(atual);
  const anterior = sel.value;
  sel.innerHTML = "";
  for (const a of anos) {
    const o = document.createElement("option");
    o.value = a; o.textContent = a;
    sel.appendChild(o);
  }
  if (anos.map(String).includes(anterior)) sel.value = anterior;
}

// guarda o alunoId cuja linha está expandida (para manter aberto após excluir)
let _alunoExpandido = null;

async function renderDados() {
  await popularAnos();
  const turmaId = Number($("#sel-turma-view").value);
  const div = $("#resultado-dados");
  if (!turmaId) {
    _alunoExpandido = null;
    div.innerHTML = '<p class="vazio">Selecione uma turma.</p>'; return;
  }

  const semestre = Number($("#sel-semestre").value);
  const ano = Number($("#sel-ano").value);
  const dados = await DB.faltasPorAluno(turmaId, ano, semestre);

  if (dados.length === 0) {
    div.innerHTML = '<p class="vazio">Esta turma não tem alunos.</p>';
    return;
  }

  const total = dados.reduce((s, d) => s + d.totalFaltas, 0);
  let html = "<table><thead><tr><th>Aluno</th><th style='text-align:right'>Faltas</th></tr></thead><tbody>";
  for (const d of dados) {
    const zero = d.totalFaltas === 0;
    // alunos sem faltas: número não é clicável (nada para abrir)
    const seta = zero ? "" : '<span class="seta">▾</span>';
    const tag = zero ? "span" : "button";
    html +=
      `<tr data-aluno="${d.alunoId}">
        <td>${escape(d.nome)}</td>
        <td class="num"><${tag} class="pill ${zero ? "zero" : ""}" ${zero ? "" : `data-aluno="${d.alunoId}"`}>${d.totalFaltas}${seta}</${tag}></td>
      </tr>`;
  }
  html += "</tbody></table>";
  html += `<p class="sub" style="margin:14px 0 0 0">Total de faltas no período: <strong>${total}</strong>.</p>`;
  div.innerHTML = html;

  // liga o clique nos números (pills) para expandir/recolher
  div.querySelectorAll("button.pill").forEach((btn) => {
    btn.addEventListener("click", () =>
      alternarDetalhe(Number(btn.dataset.aluno), btn.closest("tr"))
    );
  });

  // reabre a linha que estava aberta antes (ex.: após excluir uma falta)
  if (_alunoExpandido != null) {
    const btn = div.querySelector(`button.pill[data-aluno="${_alunoExpandido}"]`);
    if (btn) abrirDetalhe(_alunoExpandido, btn.closest("tr"));
    else _alunoExpandido = null;
  }
}

// abre ou fecha a lista de datas abaixo do aluno
async function alternarDetalhe(alunoId, tr) {
  const proxima = tr.nextElementSibling;
  if (proxima && proxima.classList.contains("detalhe")) {
    // já está aberto -> fecha
    proxima.remove();
    tr.classList.remove("aberto");
    _alunoExpandido = null;
    return;
  }
  // fecha qualquer outro aberto antes de abrir este
  const tabela = tr.closest("table");
  tabela.querySelectorAll("tr.detalhe").forEach((r) => r.remove());
  tabela.querySelectorAll("tr.aberto").forEach((r) => r.classList.remove("aberto"));
  await abrirDetalhe(alunoId, tr);
}

async function abrirDetalhe(alunoId, tr) {
  const semestre = Number($("#sel-semestre").value);
  const ano = Number($("#sel-ano").value);
  const ini = semestre === 1 ? `${ano}-01-01` : `${ano}-07-16`;
  const fim = semestre === 1 ? `${ano}-07-15` : `${ano}-12-31`;

  // mostra só as faltas DESTE semestre/ano (coerente com o número exibido)
  const todas = await DB.datasDeFalta(alunoId);
  const datas = todas.filter((d) => d >= ini && d <= fim).sort().reverse();

  let lista = '<ul class="datas-falta">';
  for (const d of datas) {
    lista += `<li>
      <span>${formatarBR(d)}</span>
      <button data-data="${d}" data-aluno="${alunoId}">Excluir</button>
    </li>`;
  }
  lista += "</ul>";

  const linha = document.createElement("tr");
  linha.className = "detalhe";
  linha.innerHTML = `<td colspan="2"><div class="caixa-datas">${lista}</div></td>`;
  tr.classList.add("aberto");
  tr.after(linha);
  _alunoExpandido = alunoId;

  // liga os botões de excluir desta linha
  linha.querySelectorAll(".datas-falta button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const data = btn.dataset.data;
      const aid = Number(btn.dataset.aluno);
      if (!confirm(`Excluir a falta de ${formatarBR(data)}? Esta ação não pode ser desfeita.`)) return;
      await DB.removerFalta(aid, data);
      toast(`Falta de ${formatarBR(data)} excluída.`);
      await renderDados();  // recalcula o número e reabre a linha
    });
  });
}

["#sel-turma-view", "#sel-semestre", "#sel-ano"].forEach((sel) =>
  $(sel).addEventListener("change", () => { _alunoExpandido = null; renderDados(); })
);

/* ---------- utilidades ---------- */
function escape(s) {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function formatarBR(iso) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/* ---------- inicialização ---------- */
(async function init() {
  $("#data-falta").value = new Date().toISOString().slice(0, 10);
  await preencherSelectsTurma();
  await carregarEditorAlunos();
})();
