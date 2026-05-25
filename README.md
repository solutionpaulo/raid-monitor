# Monitor de Software RAID - Windows Server (Dynamic Disks)

Este projeto é uma aplicação web para monitoramento periódico do status de volumes em Software RAID (discos dinâmicos) do Windows Server. A aplicação roda localmente no servidor para garantir segurança e performance.

## 🚀 Guia de Inalação no Windows Server

### 1. Pré-requisitos
*   **Node.js**: Versão 18 ou superior instalada no servidor.
*   **Privilégios**: A aplicação deve ser executada como **Administrador** para que o `diskpart` possa acessar as informações dos discos.

### 2. Preparação
1.  Copie a pasta `raid-monitor` para o diretório de sua preferência no servidor (ex: `C:\Scripts\raid-monitor`).
2.  Abra o **Prompt de Comando** ou **PowerShell** como Administrador.
3.  Navegue até a pasta:
    ```bash
    cd C:\Scripts\raid-monitor
    ```
4.  Instale as dependências:
    ```bash
    npm install
    ```

### 3. Configuração
1.  Crie o arquivo `.env` a partir do exemplo:
    ```bash
    copy .env.example .env
    ```
2.  Edite o arquivo `.env` com suas preferências:
    *   `DEMO_MODE=false` (Mude para **false** para monitorar os discos reais).
    *   `PORT=3000` (Porta do dashboard).
    *   `CHECK_INTERVAL_SECONDS=60` (Frequência de verificação).
    *   Configure SMTP ou Webhook para receber alertas por e-mail ou Teams/Slack.

### 4. Execução e Teste
Para testar se tudo está funcionando antes de instalar como serviço:
```bash
npm start
```
Abra o navegador em `http://localhost:3000`.

### 5. Instalação como Serviço Windows
Para que o monitoramento rode silenciosamente em segundo plano e inicie com o Windows:
```bash
npm run install-service
```
Isso criará um serviço chamado **"RAID Monitor"**.

---

## 🛠️ Estrutura do Projeto
*   `server.js`: Servidor principal.
*   `raid-monitor.db`: Banco de dados SQLite onde o histórico é armazenado.
*   `public/`: Interface visual do dashboard.
*   `src/monitor/parser.js`: Lógica que lê e interpreta a saída do `diskpart`.
*   `scripts/install-service.js`: Utilitário para gerenciar o serviço Windows.

## ⚠️ Observações Importantes
*   **Segurança**: Por padrão, o dashboard escuta em `127.0.0.1`. Se precisar acessar de outra máquina, mude `HOST=0.0.0.0` no `.env` e configure o firewall do Windows para abrir a porta 3000.
*   **Discos Dinâmicos**: Esta aplicação foca especificamente em RAID via Discos Dinâmicos (Mirror, RAID-5, etc.). Para Storage Spaces modernos, os comandos PowerShell nativos seriam diferentes.
*   **Logs**: Erros de execução são registrados no console e no log do serviço se instalado.

---
Desenvolvido para monitoramento de infraestrutura crítica.
