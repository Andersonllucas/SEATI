# Plano de Implementação: Ocultamento Seguro da Troca de Banco & Ajuste do Tab no Login

## 1. Visão Geral
Atender a duas necessidades essenciais de segurança e usabilidade na tela de autenticação (`/login`):
1. **Ocultar a Troca de Banco & Indicador**: Manter a tela de login 100% limpa para clientes comuns, sem expor o botão de troca de cliente e sem expor o nome do banco de dados conectado. Ativar o seletor apenas quando você der **3 cliques rápidos no logotipo**.
2. **Navegação Fluida por Teclado (Tab)**: Fazer com que o pressionamento da tecla `Tab` após preencher o e-mail/login pule diretamente para o campo de senha, ignorando o link "Esqueceu a senha?".

---

## 2. Mudanças Detalhadas

### A. Ocultamento e Gatilho Secreto (3 Cliques no Logotipo)
- **Arquivo**: `components/LoginView.tsx`
- **Comportamento Padrão**:
  - O indicador de banco conectado (`banco: seati-d0096` ou `fir-seati`) e o botão "Trocar Cliente / Banco" ficam ocultos por padrão.
  - O cliente comum verá apenas a identidade visual da campanha e o formulário de login limpo.
- **Mecanismo de Ativação Secreta**:
  - Implementar contador de cliques no elemento do logotipo (`header` da tela de login).
  - Ao registrar 3 cliques dentro de um intervalo de 1,5 segundos:
    - O modal `TenantSwitcherModal` é aberto imediatamente, ou o painel de troca é revelado de forma discreta para você alternar o banco desejado (`PRODUÇÃO`, `seati-marcelo`, etc.).
  - Incluir também suporte opcional para `?master=1` na URL caso você prefira acessar diretamente com o painel liberado.

### B. Correção da Ordem do Tab (Login -> Senha)
- **Arquivo**: `components/LoginView.tsx`
- **Problema Atual**:
  - O botão "Esqueceu a senha?" está posicionado no DOM imediatamente antes do `<input type="password" />`, fazendo o navegador focar nele ao pressionar `Tab` a partir do e-mail.
- **Solução**:
  - Adicionar `tabIndex={-1}` no botão "Esqueceu a senha?".
  - Adicionar `tabIndex={-1}` no botão de alternar visibilidade de senha (ícone de olho).
  - Definir a sequência de foco lógica:
    1. Input de E-mail
    2. Input de Senha
    3. Checkbox "Lembrar de mim"
    4. Botão "Entrar no Sistema"
  - Com isso, ao digitar o login e pressionar `Tab`, o foco pula instantaneamente para a senha, permitindo digitação contínua e rápida.

---

## 3. Verificação e Testes
- Testar o fluxo de teclado: digitar login -> pressionar `Tab` -> cursor deve estar pronto no campo de senha.
- Testar a tela sem interação especial: garantir que nenhum indicador de banco ou botão de troca fique visível.
- Testar o triplo clique no logotipo: confirmar que o seletor de banco é acionado com sucesso.
- Executar compilação com `compile_applet` para certificar integridade do build.
