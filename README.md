# Diário de Faltas — PWA offline

App de registro de faltas que roda **100% no celular**, sem internet e sem PC ligado.
Os dados ficam guardados no próprio aparelho (IndexedDB).

## Arquivos

```
index.html     interface (3 abas: Turmas, Chamada, Relatório)
app.js         lógica da tela
db.js          camada de dados (IndexedDB) — equivale ao antigo db.py
sw.js          service worker (faz funcionar offline)
manifest.json  permite instalar como app
icon-192.png / icon-512.png   ícones
```

## Regra de semestre (configurada)

- 1º semestre: **01/01 a 15/07**
- 2º semestre: **16/07 a 31/12**

Para mudar, edite a função `faltasPorAluno` em `db.js`.

## Como instalar no celular

Um PWA precisa ser servido por **https** (ou localhost) para instalar e funcionar
offline. Não basta abrir o arquivo direto (file://) — o service worker não roda assim.
Dois caminhos:

### Opção A — hospedar de graça (recomendado, instala como app)

1. Suba a pasta num host estático grátis: **GitHub Pages**, **Netlify** ou **Cloudflare Pages**
   (arrasta a pasta e pronto, nenhum servidor próprio).
2. Abra o link no **navegador do celular**.
3. No menu do navegador, toque em **"Adicionar à tela inicial"** / **"Instalar app"**.
4. A partir daí, abre pelo ícone e funciona **offline** — a hospedagem só foi
   usada para instalar; os dados nunca saem do celular.

> Importante: hospedar aqui é só para *entregar os arquivos uma vez*. Diferente
> da versão Streamlit, o processamento e os dados são locais — não dependem do site
> depois de instalado.

### Opção B — testar rápido na mesma rede

Se quiser só testar a partir do PC:
```bash
cd faltas_pwa
python3 -m http.server 8000
```
No celular (mesmo Wi-Fi): `http://IP_DO_PC:8000`
(o modo offline/instalação completo exige https — use a Opção A para uso real.)

## Backup (importante)

Como os dados ficam só no celular, **um aparelho perdido = dados perdidos**.
Na aba **Turmas → Backup**:
- **Exportar**: baixa um arquivo `.json` com tudo. Guarde de tempos em tempos.
- **Importar**: restaura a partir de um `.json` (substitui os dados atuais).

## Observações de uso

- Falta duplicada (mesmo aluno, mesma data) é ignorada automaticamente.
- Remover um aluno da lista apaga também as faltas dele.
- Alunos com zero faltas aparecem no relatório (com 0).
