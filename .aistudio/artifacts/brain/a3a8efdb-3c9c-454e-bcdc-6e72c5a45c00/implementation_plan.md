# Disparador e Validação de Eleitores em Lote via WhatsApp

Disparador inteligente e assistido no navegador para validação de eleitores em massa via WhatsApp, com controle de intervalo anti-bloqueio, templates personalizados, atualização automática para "Contatado aguardando retorno" e métricas completas de conversão.

---

## Revisão do Usuário & Decisões Confirmadas

> [!IMPORTANT]
> As seguintes decisões foram confirmadas nas perguntas de alinhamento e guiarão toda a arquitetura da solução:

- **Modelo de Envio Escolhido**: Fila guiada no navegador (sem custos de APIs pagas de terceiros como Z-API ou Evolution, e sem risco de banimento de número por robôs autômatos).
- **Atualização Automática de Status**: Eleitores disparados recebem automaticamente o status **"Contatado aguardando retorno"** e histórico de validação registrado com data, horário e operador.
- **Recursos Principais Inclusos**:
  1. Seleção múltipla de eleitores com filtros avançados por liderança e sub-liderança.
  2. Gerenciador de templates de mensagens com interpolação de variáveis dinâmicas (`{nome}`, `{primeiro_nome}`, `{lideranca}`, `{bairro}`, `{cidade}`).
  3. Temporizador configurável anti-bloqueio entre cada envio (ex: 3s a 15s) com botões de Pausar, Pular (Skip) e Avançar Manualmente.
  4. Painel/Relatório de disparos com taxa de sucesso, contatados e retorno de validação.

---

## 1. Visão Geral & Conceito Central

### O que o sistema faz
Permite que o coordenador da campanha ou equipe de validação selecione centenas de eleitores cadastrados — filtrando especificamente por liderança política, bairro ou status pendente — e inicie uma campanha de validação via WhatsApp. 

O sistema organiza uma **Fila Guiada Inteligente (Queue Runner)** na tela: para cada eleitor da fila, formata a mensagem personalizada, abre a conversa oficial no WhatsApp Web / Desktop, registra o envio no banco de dados e avança com um contador regressivo seguro (evitando denúncias de spam).

### Público-Alvo & Persona
- Coordenadores eleitorais, operadores de telemarketing e lideranças que precisam confirmar se os eleitores indicados realmente votam no candidato e necessitam de materiais ou transporte.

### Valor Agregado
- **Economia direta**: R$ 0,00 de custo com APIs de disparo pago.
- **Proteção do chip da campanha**: Disparo com controle humano assistido e cadência aleatorizada/configurável reduz o risco de banimento no WhatsApp a praticamente zero.
- **Produtividade 10x maior**: O operador não precisa redigir mensagens, copiar números nem atualizar manualmente o status de cada eleitor um a um.

---

## 2. Experiência do Usuário & Design Visual

### Fluxos Chave do Usuário

```
┌─────────────────────────┐       ┌─────────────────────────┐       ┌─────────────────────────┐
│ 1. Filtro & Seleção     │       │ 2. Configurar Disparo   │       │ 3. Execução Guiada      │
│ • Filtrar por Liderança │ ────> │ • Escolher Modelo/Texto │ ────> │ • Contador regressivo   │
│ • Filtrar por Pendência │       │ • Variáveis dinâmicas   │       │ • Abertura do WhatsApp  │
│ • Seleção em massa      │       │ • Definir Delay (ex: 5s)│       │ • Atualização do status │
└─────────────────────────┘       └─────────────────────────┘       └────────────┬────────────┘
                                                                                 │
                                                                                 ▼
                                                                    ┌─────────────────────────┐
                                                                    │ 4. Painel de Relatório  │
                                                                    │ • % Contatados          │
                                                                    │ • Resumo por Liderança  │
                                                                    │ • Histórico de envios   │
                                                                    └─────────────────────────┘
```

1. **Filtro e Seleção na Tela de Validação**:
   - O operador filtra os eleitores pela liderança desejada (ou sub-liderança), pendência ou zona eleitoral.
   - Um novo botão de destaque **"Disparo WhatsApp em Lote"** é acionado ao selecionar eleitores (ou selecionar todos os filtrados com telefone válido).
2. **Modal de Configuração do Disparo**:
   - Pré-visualização dinâmica da mensagem em tempo real simulando o balão verde do WhatsApp.
   - Seleção de templates pré-configurados (ex: "Confirmação de Voto", "Agradecimento e Adesivo", "Verificação de Dados Pendentes") ou digitação livre.
   - Seletor de tempo de espera entre mensagens (3s, 5s, 8s, 12s, 15s) com modo de intervalo aleatório (+/- 2s) para humanização do envio.
3. **Fila Guiada Assistida (Assistente de Disparo)**:
   - Interface focada com cartão do eleitor atual (foto/iniciais, nome completo, telefone formatado, liderança vinculada).
   - Barra de progresso linear com indicador `Eleitor 14 de 120 (11%)`.
   - Botão primário com temporizador de disparo (`Avançar e Abrir WhatsApp (5s)`), botão `Pausar / Retomar`, e botão `Pular este eleitor`.
   - A cada disparo acionado, o eleitor tem seu status atualizado instantaneamente para **"Contatado aguardando retorno"** e o histórico de validação é persistido no Firestore.
4. **Relatório & Histórico de Disparos**:
   - Card analítico no topo da página de validação exibindo: Total com WhatsApp, Contatados aguardando retorno, Validados confirmados e Taxa de retorno.

### Direção Estética & Identidade Visual
- **Paleta de Cores**: Neutros refinados do sistema SEATI (`bg-surface`, `text-on-surface`, `border-outline-variant`), combinados com o tom institucional esmeralda do WhatsApp (`emerald-600` e fundos suaves `emerald-500/10`) aplicados exclusivamente nos pontos de ação ativa.
- **Tipografia**: Tipografia limpa sem pills estáticas decorativas. Números tabulares monospaçados (`font-mono tabular-nums`) para contadores regressivos, telefones e porcentagens.
- **Feedback & Micro-interações**: Contagem regressiva suave com barra de tempo decrescente, efeitos de transição entre cartões de eleitor na fila e chime sonoro sutil ao completar a fila de disparos.

---

## 3. Decisões de Produto & Trade-Offs

### Decisão 1: Fila Guiada no Navegador vs API Backend Não Oficial
- **Abordagem Escolhida**: Fila assistida no navegador via links `https://wa.me/55...` e protocolo `whatsapp://send`.
- **Por quê**: As APIs não oficiais (Z-API, Evolution, Baileys) exigem servidor Node sempre ativo, autenticação por QR Code com frequente desconexão e alto risco de bloqueio definitivo do número oficial de campanha pelo Meta/WhatsApp. A fila guiada é 100% gratuita, confiável, à prova de desconexão e legalmente segura para a campanha.
- **Alternativa Descartada**: Disparo 100% autônomo sem interação humana, devido ao alto risco de banimento de chip no período eleitoral.

### Decisão 2: Novo Status de Validação (`Contatado aguardando retorno`)
- **Abordagem Escolhida**: Estender o tipo `StatusValidacao` em `VoterContext` para incluir `'Contatado aguardando retorno'` ao lado de `'Confirmado'`, `'Pendente'` e `'Negado'`.
- **Por quê**: Diferencia com precisão cirúrgica eleitores que nunca foram procurados daqueles que já receberam mensagem pelo WhatsApp e estão apenas aguardando a resposta no celular da equipe.

### Decisão 3: Gestão de Modelos de Mensagem (Templates)
- **Abordagem Escolhida**: Armazenamento de templates personalizados por comitê/tenant com variáveis automáticas `{nome}`, `{primeiro_nome}`, `{lideranca}`, `{bairro}`, `{cidade}` e `{candidato}`.
- **Por quê**: Permite que a coordenação crie mensagens diferentes para líderes diferentes (ex: "Olá João, o vereador Silva e seu amigo Marcos Líder pediram para confirmar seu apoio...").

---

## 4. Arquitetura Técnica & Estrutura de Componentes

### Diagrama da Arquitetura do Módulo

```
┌────────────────────────────────────────────────────────────────────────┐
│                        app/validacao/page.tsx                          │
│                                                                        │
│  ┌───────────────────────┐  ┌───────────────────────────────────────┐  │
│  │ Filtro Liderança      │  │ Tabela de Eleitores                   │  │
│  │ e Sub-Liderança       │  │ (Checkboxes de seleção em lote)       │  │
│  └───────────┬───────────┘  └───────────────────┬───────────────────┘  │
│              │                                  │                      │
│              ▼                                  ▼                      │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Barra Flutuante de Lote: [ 45 Eleitores Selecionados ]           │  │
│  │ [Disparar WhatsApp em Lote]  [Validação Manual em Lote]          │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
└─────────────────────────────────────┼──────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│               components/validacao/WhatsAppBatchModal.tsx              │
│                                                                        │
│  ┌───────────────────────────────┐  ┌───────────────────────────────┐  │
│  │ Configuração do Disparo       │  │ Fila Guiada Ativa (Runner)    │  │
│  │ • Seleção de Template         │  │ • Eleitor Atual e Detalhes    │  │
│  │ • Editor com Variáveis        │  │ • Contador Regressivo Delay   │  │
│  │ • Configuração de Intervalo   │  │ • [Disparar & Próximo]        │  │
│  │ • Preview da Mensagem         │  │ • [Pausar] [Pular Eleitor]    │  │
│  └───────────────────────────────┘  └───────────────┬───────────────┘  │
└─────────────────────────────────────────────────────┼──────────────────┘
                                                      │
                                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   context/VoterContext.tsx                             │
│                                                                        │
│  • registrarValidacao(id, {                                            │
│      tipo: 'Mensagem',                                                 │
│      status: 'Contatado aguardando retorno',                           │
│      observacoes: 'Disparo em lote WhatsApp (Template: ...)'           │
│    })                                                                  │
│  • Atualização local e sincronização atômica Firestore                 │
└────────────────────────────────────────────────────────────────────────┘
```

### Mapeamento de Estado & Funções

1. **`VoterContext.tsx`**:
   - `export type StatusValidacao = 'Confirmado' | 'Pendente' | 'Negado' | 'Contatado aguardando retorno';`
   - Suporte transparente nos métodos `registrarValidacao` e `batchUpdateEleitores`.
   - Adição do filtro e contadores de "Contatado aguardando retorno" nas métricas de validação.

2. **`components/validacao/WhatsAppBatchModal.tsx`**:
   - Componente modal especializado com 2 passos:
     - **Passo 1: Parametrização**: Seleção de template, substituição de variáveis dinâmicas, seletor de delay anti-bloqueio (ex: 3s a 15s) e resumo dos contatos válidos (com celular/WhatsApp preenchido).
     - **Passo 2: Assistente de Disparo (Fila Guiada)**:
       - Fila com índice atual, temporizador visual, botões de ação manual ou avanço assistido.
       - Montagem do link `https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`.
       - Ao disparar cada contato, executa `registrarValidacao` com `status: 'Contatado aguardando retorno'`.
       - Opções de parar a fila a qualquer momento, retomar de onde parou ou pular eleitores específicos.

3. **`app/validacao/page.tsx`**:
   - Integração do botão de disparo em lote na barra de ações coletivas.
   - Filtro atualizado para permitir visualizar eleitores com status "Contatado aguardando retorno".
   - Novos cards de métricas no topo refletindo a taxa de envio e taxa de retorno.

4. **Gerenciador de Templates**:
   - Templates salvos em memória e persistidos localmente/no tenant para reutilização entre sessões de trabalho.
   - Variáveis suportadas:
     - `{nome}`: Nome completo do eleitor
     - `{primeiro_nome}`: Primeiro nome do eleitor
     - `{lideranca}`: Nome da liderança vinculada
     - `{bairro}`: Bairro do eleitor
     - `{cidade}`: Cidade da campanha
     - `{campanha}`: Nome da campanha ou candidato

---

## 5. Plano de Verificação e Testes

- [ ] **Validação de Tipos**: Compilar TypeScript para garantir que `'Contatado aguardando retorno'` seja aceito em todo o ecossistema sem quebrar tabelas, filtros ou relatórios.
- [ ] **Fluxo de Filtro por Liderança**: Selecionar uma liderança específica, marcar múltiplos eleitores e abrir o disparador.
- [ ] **Substituição de Variáveis**: Confirmar se as tags `{nome}`, `{primeiro_nome}` e `{lideranca}` são interpoladas corretamente nos textos.
- [ ] **Fila Assistida**: Testar o temporizador regressivo, pausa, pulo de eleitor e abertura de link do WhatsApp.
- [ ] **Atualização de Status**: Confirmar se o eleitor passa de "Pendente" para "Contatado aguardando retorno" imediatamente após o envio.
- [ ] **Relatório de Validação**: Confirmar se os números de contatados são contabilizados nos gráficos e tabelas da tela.
