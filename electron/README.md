# SEATI Desktop (Instalador Windows .EXE)

Esta pasta contém o projeto oficial do aplicativo Desktop do **SEATI**, empacotado com Electron e Electron Builder.

## 🚀 Como Gerar o Instalador `.exe` no seu computador

### Pré-requisitos:
- Ter o **Node.js** instalado no seu computador ([baixar aqui](https://nodejs.org/)).

### Passo a Passo:

1. Abra o terminal ou Prompt de Comando (CMD) dentro desta pasta `electron`:
   ```bash
   cd electron
   ```

2. Instale as dependências (apenas na primeira vez):
   ```bash
   npm install
   ```

3. **Para gerar o Instalador Padrão (`SEATI-Setup.exe`)**:
   ```bash
   npm run dist:win
   ```
   *O instalador será gerado na pasta `electron/dist/SEATI-Setup-1.0.0.exe`.*

4. **Para gerar uma Versão Portátil (sem instalação, roda direto do Pen Drive)**:
   ```bash
   npm run dist:portable
   ```
   *O executável portátil será gerado em `electron/dist/SEATI-1.0.0.exe`.*

---

## ⚙️ Como Alterar a URL do Servidor
O arquivo `main.js` carrega por padrão o endereço em nuvem do sistema. Se você quiser apontar para outro subdomínio (ex: `https://seati-d0096.adti.app.br`), basta alterar a constante `DEFAULT_URL` na linha 5 de `main.js`.
