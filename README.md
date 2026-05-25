# Monitor de Software RAID - Windows Server (Dynamic Disks)

Aplicação web para monitoramento periódico do status de volumes em Software RAID (discos dinâmicos) do Windows Server. Inclui dashboard em tempo real, alertas por e-mail/webhook e histórico de verificações.

## Funcionalidades

- **Monitoramento contínuo** de volumes RAID (Mirror, RAID-5, Striped, Spanned)
- **Dashboard em tempo real** via SSE (Server-Sent Events) com atualização automática
- **Saúde dos discos físicos** — exibe HealthStatus, OperationalStatus, MediaType e BusType do `Get-PhysicalDisk`
- **Alertas** por e-mail (SMTP) ou webhook (Teams/Slack/Discord) com cooldown
- **Timeline de saúde** com gráfico das últimas 24h
- **Histórico de verificações** com paginação
- **Espaço em disco** com barra de uso por volume
- **Reconhecimento de alertas** com contador de pendentes
- **Modal de reparo** para reconstrução de volumes degradados
- **Notificações no navegador** (Web Notification API)
- **Modo demo** para testes sem RAID real

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js + Express |
| Frontend | HTML/CSS/JS vanilla (sem frameworks) |
| Banco | SQLite3 |
| Coleta | diskpart.exe + PowerShell (`Get-CimInstance`, `Get-PhysicalDisk`) |
| Scheduler | `setInterval` com lock anti-sobreposição |
| Logger | Níveis (debug/info/warn/error) com timestamp |

## 🚀 Instalação no Windows Server

### Pré-requisitos

- **Node.js** 18+ instalado no servidor
- **Privilégios de Administrador** para execução do `diskpart`

### Passos

```bash
# 1. Clone ou copie a pasta para o servidor
git clone https://github.com/solutionpaulo/raid-monitor.git
cd raid-monitor

# 2. Instale as dependências
npm install

# 3. Configure o ambiente
copy .env.example .env
# Edite o .env conforme necessário

# 4. Teste
npm start
# Acesse http://localhost:3000

# 5. Instale como serviço Windows (opcional)
npm run install-service
```

## Configuração (.env)

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `PORT` | `3000` | Porta do dashboard |
| `HOST` | `127.0.0.1` | Endereço do servidor (`0.0.0.0` para acesso remoto) |
| `CHECK_INTERVAL_SECONDS` | `60` | Intervalo entre verificações |
| `DEMO_MODE` | `false` | `true` = dados simulados (sem diskpart) |
| `RETENTION_DAYS` | `90` | Dias de retenção do histórico |
| `LOG_LEVEL` | `info` | Nível do logger: `debug`, `info`, `warn`, `error` |
| `SMTP_HOST` | — | Servidor SMTP para alertas por e-mail |
| `SMTP_PORT` | `587` | Porta SMTP |
| `SMTP_SECURE` | `false` | `true` para TLS |
| `SMTP_USER` | — | Usuário SMTP |
| `SMTP_PASS` | — | Senha SMTP |
| `ALERT_EMAIL_FROM` | — | Remetente do e-mail |
| `ALERT_EMAIL_TO` | — | Destinatário do e-mail |
| `WEBHOOK_URL` | — | URL do webhook (Teams/Slack/Discord) |

## Estrutura do Projeto

```
raid-monitor/
├── server.js                 # Servidor Express + graceful shutdown
├── package.json
├── .env.example              # Template de configuração
├── public/
│   ├── index.html            # Dashboard SPA
│   ├── css/styles.css        # Design system (tema escuro)
│   └── js/
│       ├── app.js            # Lógica principal (SSE, render, eventos)
│       ├── charts.js         # Timeline canvas + helpers
│       └── notifications.js  # Toast + Web Notification API
├── src/
│   ├── config.js             # Leitura do .env
│   ├── logger.js             # Logger estruturado com níveis
│   ├── database/
│   │   ├── init.js           # Conexão SQLite + schema
│   │   └── queries.js        # CRUD com promisify
│   ├── executor/
│   │   ├── runner.js         # Execução de diskpart + PowerShell
│   │   └── scripts.js        # Scripts PowerShell embutidos
│   ├── monitor/
│   │   ├── collector.js      # Coleta e parse dos dados
│   │   ├── parser.js         # Parser da saída do diskpart
│   │   ├── alerter.js        # Disparo de alertas (e-mail/webhook)
│   │   └── scheduler.js      # Agendador com lock anti-overlap
│   └── routes/
│       ├── api.js            # REST API (status, history, alerts, repair)
│       └── sse.js            # Server-Sent Events endpoint
└── scripts/
    └── install-service.js    # Instalação como serviço Windows
```

## API REST

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/status` | Último check + status do scheduler |
| `GET` | `/api/stats` | Estatísticas (uptime, total checks, alertas pendentes) |
| `GET` | `/api/history` | Histórico paginado (`?limit=&offset=`) |
| `GET` | `/api/history/:id` | Check específico |
| `POST` | `/api/check` | Forçar verificação manual |
| `GET` | `/api/alerts` | Alertas (`?limit=&acknowledged=true/false`) |
| `PUT` | `/api/alerts/:id/ack` | Reconhecer alerta |
| `PUT` | `/api/alerts/ack-all` | Reconhecer todos |
| `POST` | `/api/maintenance/repair` | Iniciar reparo RAID |
| `GET` | `/api/maintenance/logs` | Logs de manutenção |
| `GET` | `/api/settings` | Configurações atuais |
| `GET` | `/api/events` | SSE — eventos em tempo real |

## Comandos

```bash
npm start              # Iniciar o monitor
npm run dev            # Iniciar com --watch (hot reload)
npm run install-service   # Instalar como serviço Windows
npm run uninstall-service # Remover serviço Windows
```

## ⚠️ Observações

- **Segurança**: O dashboard escuta em `127.0.0.1` por padrão. Para acesso remoto, configure `HOST=0.0.0.0` e libere a porta no firewall.
- **Discos Dinâmicos**: Focado em RAID via Dynamic Disks (Mirror, RAID-5). Para Storage Spaces, os comandos PowerShell seriam diferentes.
- **PowerShell**: Detecta automaticamente `pwsh.exe` (PowerShell 7) com fallback para `powershell.exe`.
- **Logs**: O logger inclui timestamps ISO e níveis. Configure `LOG_LEVEL=debug` para mais detalhes.

---

Desenvolvido para monitoramento de infraestrutura crítica.
