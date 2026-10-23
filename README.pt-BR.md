# Floria SelfDock ⚓

> Software open-source, feito com simplicidade. — [FloriaApps](https://github.com/FloriaApps)

[![Deploy](https://github.com/FloriaApps/Floria-selfdock/actions/workflows/deploy.yml/badge.svg)](https://github.com/FloriaApps/Floria-selfdock/actions/workflows/deploy.yml)

[English](README.md) · **Português (Brasil)**

Um painel bonito e simples para o seu home lab, no estilo [Material Design 3](https://m3.material.io). Ele encontra sozinho os apps que rodam no seu Docker, atualiza o status em tempo real e deixa você ligar, parar e reiniciar cada um com um toque. Pensado para quem não quer editar arquivos YAML.

O SelfDock é a versão **web e Docker** do [Floria SelfHub](https://github.com/FloriaApps/Floria-selfhub), o app desktop: a mesma ideia, em outra casa.

## O que ele faz

- **Cartões automáticos:** lê os containers do Docker e monta o painel sozinho (nome, descrição, categoria e porta).
- **Ícones automáticos:** descobre o logotipo de cada app pelo nome da imagem, baixa do [dashboard-icons](https://github.com/homarr-labs/dashboard-icons) uma única vez e guarda no volume. Depois disso funciona offline.
- **Tempo real:** o Docker avisa o SelfDock quando algo muda e o painel atualiza na hora, por WebSocket.
- **Iniciar, parar e reiniciar**, com confirmação, e **ver registros (logs)**.
- **Métricas do servidor:** disco, memória e processador.
- **Histórico de quedas:** quando cada app caiu, por quê (ex.: "ficou sem memória") e quanto tempo ficou fora. Mostra a disponibilidade em 24 h e 7 dias. Paradas que você pediu pelo painel não contam como queda.
- **Atualizações de imagem:** consulta digests de registros públicos e sinaliza containers com uma versão mais nova disponível. O proxy do socket Docker precisa permitir leitura dos metadados de imagens (`IMAGES=1`); registros privados podem não permitir a consulta.
- **Avisos:** app que parou, app com a verificação de saúde falhando, app reiniciando em loop, disco ou memória quase cheios.
- **Editor de compose e `.env`:** edite os arquivos das suas stacks no navegador, com verificação enquanto digita (inclusive portas já em uso) e backups automáticos. Veja [abaixo](#editar-arquivos-compose-e-env-editor-de-stacks).
- **Serviços fora do Docker** (roteador, NAS...): você adiciona o endereço e o SelfDock testa se está no ar.
- Login obrigatório, tema claro/escuro e **cor dinâmica** (Material You) gerada a partir da cor que você escolher. Dá para escolher também o estilo da cor (tonal, vibrante, expressivo...), o nível de contraste e ligar ou desligar as animações elásticas "expressivas".
- **Inglês e português do Brasil:** o inglês é o padrão; o painel segue o idioma do navegador e dá para trocar nos Ajustes.

## Testar agora (modo demonstração, sem Docker)

Precisa de Node 22.13 ou mais novo.

```bash
npm install
npm run dev:demo
```

Abra http://localhost:5173, crie o usuário e pronto. No modo demonstração, o SelfDock sobe um "Docker de mentira" com 13 apps, incluindo um que cai sozinho de vez em quando para você ver o histórico e os avisos funcionando.

## Instalar no seu servidor (Docker Compose)

### A partir de uma release (nada para compilar)

Cada release publica uma imagem para várias arquiteturas (amd64 e arm64, então roda também em Raspberry Pi) e um compose pronto para usar:

```bash
mkdir floria-selfdock && cd floria-selfdock
curl -LO https://github.com/FloriaApps/Floria-selfdock/releases/latest/download/docker-compose.yml
curl -L  https://github.com/FloriaApps/Floria-selfdock/releases/latest/download/env.example -o .env
docker compose up -d
```

Tags da imagem em `ghcr.io/floria-apps/floria-selfdock`: `latest` (a release mais nova), `0.1.0` (uma versão específica) e `edge` (a branch `main` atual).

### A partir do código-fonte

```bash
cp .env.example .env
docker compose up -d --build
```

Abra `http://IP-DO-SERVIDOR:3000` e crie o seu acesso no primeiro uso.

O `docker-compose.yml` sobe também o **docker-socket-proxy**, um "porteiro" que só deixa o SelfDock listar containers, ler registros, consultar metadados das imagens e ligar/parar/reiniciar. O SelfDock nunca recebe o socket do Docker.

> **Sobre o `:ro` no socket.** Montar `/var/run/docker.sock:ro` **não** deixa o Docker em modo somente leitura: o `:ro` só protege o arquivo do socket, e a API continua aceitando qualquer comando. Quem acessa o socket controla a máquina inteira. Por isso o compose padrão usa o proxy. O `docker-compose.simple.yml` (socket direto) existe só para redes domésticas de confiança.

## Como o SelfDock descobre cada app

Tudo é automático, mas você pode ajustar com **labels** no container:

| Label | Para quê | Exemplo |
|---|---|---|
| `floria.name` | Nome exibido | `Minha Biblioteca` |
| `floria.description` | Frase curta embaixo do nome | `Filmes e séries` |
| `floria.icon` | Ícone do dashboard-icons | `jellyfin` |
| `floria.category` | `media`, `home`, `network`, `files`, `security`, `arr` ou `other` | `media` |
| `floria.port` | Porta a abrir (útil com `network_mode: host`) | `8123` |
| `floria.url` | Endereço completo (se usa proxy reverso) | `https://filmes.casa.lan` |
| `floria.hide` | Não mostrar este container | `true` |

Sem labels, o SelfDock usa o nome da imagem (ex.: `ghcr.io/immich-app/immich-server` → ícone `immich`), reconhece cerca de 45 apps populares e põe o resto em "Outros". Você também pode editar nome, ícone e categoria pelo menu ⋮ de cada app, ou ocultá-lo.

## Editar arquivos compose e .env (editor de stacks)

O SelfDock abre o `docker-compose.yml` e o `.env` das suas stacks, verifica enquanto você digita e salva com backup.

- **Verificações, na linha certa:** erros de YAML, falta da seção `services:`, `${VARIÁVEIS}` que não estão no `.env`, portas e nomes de container repetidos, **portas já usadas por outro container (com sugestão de porta livre)** e configurações arriscadas, como modo privilegiado, socket do Docker montado, tag `latest` solta e falta de política de reinício.
- **Backups:** cada vez que você salva, a versão anterior é guardada (as últimas 30 de cada arquivo) no volume de dados. Abra *Versões anteriores* para trazer uma de volta.
- **Sem perder edições:** se um arquivo mudar no disco enquanto você edita (outra aba, ou você por SSH), o SelfDock se recusa a sobrescrever e oferece recarregar.
- **Aplicar (opcional):** roda `docker compose up -d`, `pull`, `restart`, `stop` ou `down` e mostra a saída ao vivo. Nunca apaga volumes.

Ele fica desligado até você apontar a pasta das suas stacks (uma subpasta por stack, cada uma com um `compose.yaml` e, se quiser, um `.env`):

```bash
# no seu .env
STACKS_DIR=/opt/stacks
docker compose -f docker-compose.yml -f docker-compose.stacks.yml up -d
```

A pasta é montada no **mesmo caminho** dentro do SelfDock, porque o `docker compose` envia caminhos de arquivo ao Docker do host. O SelfDock roda como `SELFDOCK_UID:SELFDOCK_GID` (padrão `1000:1000`), que precisa poder escrever nessa pasta.

Para também rodar o `docker compose` pelo painel, adicione o `docker-compose.stacks-apply.yml`. **Leia o aviso dele antes:** criar containers equivale a ter controle total do servidor, então quem tiver a senha do painel poderia iniciar um container que monta o disco do host. Use uma senha forte e não exponha o SelfDock à internet sem HTTPS. Os dois arquivos vão anexados a cada release.

## Configuração

Variáveis de ambiente do container:

| Variável | Padrão | O que faz |
|---|---|---|
| `PORT` | `3000` | Porta do painel |
| `DATA_DIR` | `/data` | Onde ficam o banco (SQLite) e os ícones |
| `DOCKER_HOST` | `unix:///var/run/docker.sock` | Como falar com o Docker (`tcp://docker-proxy:2375` no compose) |
| `DISK_PATH` | `DATA_DIR` | Pasta usada para medir o disco. Monte `/:/host:ro` e use `/host` para o disco real |
| `FLORIA_STACKS_DIR` | desligado | Pasta com as suas stacks. Liga o editor de compose e `.env` |
| `FLORIA_STACKS_APPLY` | desligado | `1` = permite rodar `docker compose` pelo editor (veja o aviso acima) |
| `FLORIA_TRUST_PROXY` | desligado | Coloque `1` atrás de Caddy, Traefik ou Nginx (cookie seguro com HTTPS) |
| `FLORIA_ICONS_OFFLINE` | desligado | `1` = não baixa ícones novos da internet |
| `FLORIA_ICON_BASES` | jsDelivr + GitHub | Fontes dos ícones, separadas por vírgula |
| `FLORIA_DEMO` | desligado | `1` = modo demonstração |

## Como é por dentro

```
apps/server       Fastify + WebSocket + SQLite (node:sqlite, sem dependência nativa)
apps/web          React + Vite + Tailwind + TypeScript, com componentes Material 3 Expressive
packages/shared   tipos e categorias usados pelos dois lados
```

- **Docker:** cliente próprio e mínimo da API do Docker Engine (sem dependências), via socket ou TCP. Os eventos (`start`, `die`, `oom`, `health_status`...) atualizam o painel na hora, e uma checagem completa a cada 30 s corrige qualquer perda.
- **Quedas:** o SelfDock compara o estado antes e depois de cada evento. Um app que passa de "funcionando" para "parado/com problema/reiniciando" abre um incidente, e ele fecha quando o app volta. A causa vem do código de saída do `die` e do evento `oom`. Ao ver um app pela primeira vez, ele não inventa queda: só registra o que observa.
- **Tempo real:** `GET /api/ws` envia um `snapshot` ao conectar e depois só mudanças. O painel reconecta sozinho com espera crescente.
- **Componentes Material 3:** a interface usa o [M3E](https://matraic.github.io/m3e/), uma biblioteca de web components Material 3 Expressive (botões, chips, switch, slider, menus, diálogos, bottom sheet, navegação, listas, indicadores de progresso). O `<m3e-theme>` gera todas as cores a partir da cor escolhida. O editor de código (CodeMirror) fica em um Shadow DOM próprio, porque o M3E reescreve as folhas de estilo da página e apagaria os estilos do editor.
- **Idiomas:** o servidor envia códigos e parâmetros neutros (tipo de aviso, causa da queda, código de erro) e o painel os transforma em texto. Para adicionar um idioma, basta um arquivo em `apps/web/src/lib/i18n/`; o TypeScript confere que nenhuma chave ficou sem tradução.
- **Segurança:** senha com scrypt, sessão em cookie `HttpOnly` + `SameSite=Lax`, checagem de origem em requisições que alteram dados e no WebSocket, limite de tentativas de login, cabeçalhos de segurança e CSP.
- **Dados:** `/data/selfdock.db` (usuários, personalizações, histórico) e `/data/icons`. Faça backup desse volume.

## Desenvolvimento

```bash
npm run dev          # servidor (3000) + painel com recarga automática (5173), usando o seu Docker
npm run dev:demo     # o mesmo, com o Docker de mentira
npm run typecheck
npm test             # 31 testes, incluindo um ponta a ponta com o servidor de verdade
npm run build
```

Os pull requests rodam a checagem de tipos, os testes e uma verificação que compila a imagem Docker e a inicia. Enviar uma tag de versão (`git tag v0.1.0 && git push origin v0.1.0`) publica a imagem e cria a Release no GitHub. Veja o [CONTRIBUTING](.github/CONTRIBUTING.md).

## Limitações conhecidas

- Os testes automáticos rodam contra o "Docker de mentira" (que fala o mesmo protocolo), não contra um Docker real. A imagem do Dockerfile ainda não foi construída em um ambiente com Docker.
- As ações de Aplicar do editor e a checagem `docker compose config` foram testadas contra um programa `docker` de mentira, não contra um Docker real com o plugin compose.
- O editor mostra problemas e guarda backups, mas ainda não tem comparação lado a lado (diff).
- O JavaScript principal do painel tem cerca de 1,2 MB (270 KB comprimido), principalmente os componentes do M3E. O editor carrega separado, só quando você abre uma stack.
- O arquivo da fonte de ícones do Material Symbols tem 4,5 MB (vai junto no app para funcionar offline). Dá para reduzi-lo gerando só os ícones usados.
- Serviços manuais com HTTPS de certificado próprio (autoassinado) aparecem como fora do ar.
- Um só usuário por enquanto; não há recuperação de senha pela interface.
- Os ícones vêm do projeto dashboard-icons; os logotipos pertencem aos respectivos projetos.
- A interface usa o [M3E](https://github.com/matraic/m3e), de matraic, e as cores do Material vêm de `@material/material-color-utilities`. Obrigado aos dois.

## Contribuindo

Achou um bug ou tem uma ideia? Abra uma Issue ou um Pull Request. Antes, confira a documentação do projeto.

*Build useful things. Keep them simple. Keep them open.*
