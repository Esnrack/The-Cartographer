# The Cartographer

[English](README.md) · **Português**

Editor de mapas de fantasia no navegador, no estilo do Inkarnate: você pinta a terra
e o programa desenha sozinho as ondas da costa, a profundidade do mar, as texturas e
o envelhecimento do papel. Não precisa de build e funciona offline, exceto as fontes,
que vêm do Google Fonts.

## Como rodar

**Com Docker** (local ou em servidor):

```sh
docker compose up -d --build
# abra http://localhost:8080
```

A pasta `public/assets` é montada como volume, então dá para trocar as imagens sem
reconstruir. Basta recarregar a página.

**Sem Docker** (precisa de Python 3):

```sh
./start.sh          # ou: PORT=3000 ./start.sh
# abra http://localhost:8080
```

Abrir o `index.html` direto pelo explorador de arquivos **não funciona**: em `file://`
o navegador bloqueia os módulos JavaScript e a leitura do `manifest.json`. Qualquer
servidor estático serve (nginx, Apache, `npx serve public`…), mas aí a opção **Nextcloud**
não funciona: ele depende do proxy `server/server.py`, que roda no Docker e no `start.sh`.

## Ferramentas

Na primeira visita, um **Tutorial** passo a passo mostra como montar um mapa (dá para pular a qualquer momento, ou apertar `Esc`); o botão **Tutorial** na barra de cima abre de novo.


| Ferramenta | Tecla | Uso |
|---|---|---|
| Pincel | `B` | Pinta terreno. Modo **Balde** (no painel) preenche uma região inteira. **Água** apaga terra. "Irregularidade" deixa o litoral recortado. "Pintar só sobre terra" troca o tipo (ex.: grama → neve) sem mexer na costa. |
| Gravura | `S` | Coloca montanhas, árvores, cidades… Com "Espalhar ao arrastar" você pinta florestas e cordilheiras. |
| Texto | `T` | Nomes de reinos, mares e cidades. Aceita várias linhas. |
| Expandir | `E` | Arraste as alças nas bordas para aumentar o mapa. |
| Selecionar | `V` | Clique, `Shift`+clique ou caixa (arrastando no vazio) para selecionar. Move, redimensiona, gira, espelha, duplica (`Ctrl+D`), copia e cola (`Ctrl+C` / `Ctrl+V`) e exclui (`Delete`). |

Mover a vista: botão do meio ou direito, ou segurar `Espaço`. A roda do mouse dá zoom; `Ctrl`+roda (ou `[` / `]`) muda o tamanho do pincel ou da gravura (o raio, se estiver espalhando).

`Ctrl+Z` / `Ctrl+Y` desfazem e refazem e `Ctrl+S` salva.

## Partir de um rascunho

Em **Imagem de referência**, carregue um desenho ou um mapa (até a foto de um rascunho no papel):

- **Mostrar sobre o mapa**: decalque por cima com o pincel.
- **Converter em terreno**: detecta água (tons azulados), terra (verdes e amarelos)
  e neve (branco) pelas cores. Depois é só ajustar os detalhes com o pincel.

Crie o mapa com a mesma proporção da imagem (ex.: 4:3) para ela ocupar o mapa todo.

## Trocando as imagens (gravuras)

As gravuras vêm dos pacotes listados em [Créditos das gravuras](#créditos-das-gravuras). Para adicionar os seus:

1. Coloque a imagem (PNG com fundo transparente ou SVG) em `public/assets/…`.
2. Rode `python3 scripts/add-images.py` (o `start.sh` já faz isso ao iniciar) e recarregue a página. Ele registra no manifesto toda imagem nova, na categoria da pasta. Para ajustar nome, tamanho etc., edite `public/assets/manifest.json`:

```json
{ "id": "oak", "name": "Oak", "name_pt": "Carvalho", "file": "vegetacao/carvalho.png", "width": 40 }
```

| Campo | Significado |
|---|---|
| `id` | Identificador único, salvo no projeto. Se você trocar só o arquivo e mantiver o `id`, os mapas existentes passam a usar a nova imagem. |
| `name` | Nome exibido na biblioteca (em inglês). Vale também para as categorias. |
| `name_pt` | Nome em português (opcional; sem ele, aparece o `name`). Vale também para as categorias. |
| `file` | Caminho relativo a `assets/`. |
| `width` | Largura padrão no mapa, em pixels. A altura segue a proporção da imagem. |
| `anchor` | `"base"` (padrão: a imagem fica "de pé" sobre o ponto clicado) ou `"center"` (pontes, navios, rosa dos ventos). |
| `tags` | Palavras-chave para a busca da biblioteca, separadas por espaço (ex.: `"arvore floresta tree"`). Acentos e maiúsculas não importam. |
| `files` | No lugar de `file`: lista de variações. Cada gravura sorteia uma (ou escolha uma fixa em **Variação**, no painel da gravura). |
| `color` | `"sample"`: o branco da imagem pega a cor do terreno onde a gravura é colocada (como no Wonderdraft). |
| `colors` | `["#c1", "#c2", "#c3"]`: as partes vermelhas, verdes e azuis da imagem viram essas cores (assets "custom colors" do Wonderdraft). |

Você pode criar novas categorias à vontade. Nos SVGs, inclua `width` e `height` na tag
`<svg>`; sem isso, alguns navegadores não sabem o tamanho da imagem.

**Dica de visual:** gravuras desenhadas à mão, com contorno escuro e sombra em um lado
só, combinam melhor com o estilo. Há pacotes gratuitos (CC0 ou CC-BY) de assets de
cartografia em sites como itch.io e OpenGameArt. Confira a licença de cada um.

## Créditos das gravuras

| Pasta | Pacote | Licença | No site público? |
|---|---|---|---|
| `assets/ta/` | [T.A.'s Mapmaking Kit](https://cartographyassets.com/assets/104264/ta-mapmaking-kit/) ([T.A. Maps](https://www.patreon.com/tamaps)) | licença própria; uso no site **autorizado pelo autor** | sim, com crédito visível (já na página) |
| `assets/comigo/` | [Fantasy Icons Ink](https://comigo.itch.io/fantasy-icons-ink) (CoMiGo) | CC0 | sim |
| `assets/generated/` | gerado por `scripts/generate-mountains.py` | livre | sim |

O CoMiGo traz o arquivo de licença na pasta.

## Expandir o mapa

Com a ferramenta **Expandir** (`E`), arraste as alças douradas nas bordas do mapa (como no Paint) para aumentá-lo para qualquer lado e colocar novos continentes ou ilhas. O terreno e os objetos já desenhados ficam onde estão, a área nova começa como água e `Ctrl+Z` desfaz. Limite: 8000 px por lado.

## Planeta

**Planeta** (barra de cima) mostra o mapa como um globo, e dá para pintar e colocar gravuras direto nele. Botão direito ou do meio gira o planeta, a roda dá zoom no centro (com `Shift`, aproximar gira o planeta para o ponto sob o mouse) e **Ajustar à tela** volta ao tamanho normal. O mapa é tratado como projeção equirretangular: a largura dá a volta inteira no planeta e a altura vai de polo a polo, então use a proporção **2:1** (ex.: 4000 × 2000) para nada ficar esticado. Perto dos polos o pincel pinta uma área mais estreita, como em qualquer mapa-múndi plano. Textos podem ser editados com duplo clique, como no mapa plano, e **Exportar PNG** continua gerando o mapa plano.

## Salvar e exportar

- **Salvar** e **Abrir** mostram as opções de destino: **Neste dispositivo** baixa (ou abre) um `map.the-cartographer.json` com terreno, gravuras, textos e estilo; **Nextcloud**, **Google Drive** e **OneDrive** usam a nuvem (abaixo).
- O navegador também guarda automaticamente o último mapa (localStorage).
- **Exportar PNG** gera a imagem final em 1× ou 2×. O 2× deixa gravuras e textos mais nítidos.

## Nextcloud

A opção **Nextcloud** (em **Salvar** ou **Abrir**) salva e abre mapas na pasta `Mapas` de uma conta do Nextcloud.
Cada pessoa digita o endereço do próprio Nextcloud (ex.: `https://nuvem.exemplo.com`); o navegador
lembra o último usado. Nada precisa ser configurado no servidor do site.

- **Conectar** abre a tela de login do próprio Nextcloud numa nova aba. Depois de autorizar,
  o Nextcloud cria uma senha de app só para aquele navegador. O site nunca vê a senha da conta
  e não guarda nenhuma credencial no servidor: quem não tem conta no Nextcloud não grava nada.
- **Desconectar** revoga essa senha de app. Ela também aparece (e pode ser revogada) em
  Configurações → Segurança → Dispositivos e sessões, no Nextcloud.
- Como o endereço é digitado por quem usa o site, o proxy (`server.py`) só conecta em
  endereços HTTPS na porta 443 cujo IP seja público: nada de `localhost`, rede interna ou
  metadados de nuvem. Ele conecta no IP que conferiu, não segue redirecionamentos, limita
  as respostas a 20 MB e nunca deixa a resposta virar uma página no navegador. O site só abre
  a tela de login se ela for do próprio endereço digitado. `python3 tests/test_server.py` confere esses bloqueios.
  Nextcloud só na rede local (ex.: `192.168.…`) ou em outra porta não é aceito.
- O proxy (`server.py`) só deixa passar o login, arquivos `.json` de até 20 MB
  dentro de `Mapas` (listar, abrir, salvar e criar a pasta) e a revogação. Excluir arquivos ou
  acessar qualquer outra pasta do Nextcloud pelo site é bloqueado.
- Para isolar ainda mais, crie no Nextcloud um usuário só para os mapas (com cota pequena) e
  conecte o site com ele; depois compartilhe a pasta `Mapas` com a sua conta pessoal.

## Google Drive e OneDrive

**Salvar** e **Abrir** também oferecem Google Drive e OneDrive. O login acontece num pop-up do
próprio serviço e o site fala direto com a API dele (nada passa pelo servidor do site). O site só
enxerga os mapas que ele mesmo salvou: no Drive, a pasta `Mapas` (escopo `drive.file`); no OneDrive,
a pasta do app em `Apps/` (escopo `Files.ReadWrite.AppFolder`). A conexão vale cerca de 1 hora;
depois disso o site pede para conectar de novo.

Os dois serviços só aceitam sites registrados. Registre o site uma vez e ponha os IDs no `.env`
(fora do git; modelo em `.env.example`) como `GOOGLE_CLIENT_ID` e `ONEDRIVE_CLIENT_ID`. O
`server/server.py` gera o `js/storage/cloud-config.js` com eles no `start.sh` e no Docker; reinicie depois de
mudar o `.env`. Esses IDs não são senhas: o navegador precisa recebê-los, então quem abrir o site
consegue vê-los; o `.env` só evita que fiquem gravados no repositório. Sem eles, a opção aparece mas
avisa que não está configurada.
O endereço de retorno é o do site seguido de `oauth.html`, por exemplo `https://mapas.exemplo.com/oauth.html`
(para testar localmente: `http://localhost:8080/oauth.html`).

- **Google Drive** ([console.cloud.google.com](https://console.cloud.google.com/)): crie um projeto,
  ative a **Google Drive API**, configure a tela de consentimento (OAuth consent screen) e, em
  *Credentials → Create credentials → OAuth client ID*, escolha **Web application**. Em
  *Authorized JavaScript origins* ponha a origem do site (`https://mapas.exemplo.com`) e em
  *Authorized redirect URIs* o endereço do `oauth.html`. Copie o *Client ID* para `GOOGLE_CLIENT_ID` no `.env`.
  Enquanto o app estiver em modo de teste, só as contas listadas em *Test users* conseguem entrar.
- **OneDrive** ([entra.microsoft.com](https://entra.microsoft.com/) → *App registrations → New registration*):
  em *Supported account types* escolha contas de qualquer organização **e contas pessoais da Microsoft**;
  em *Redirect URI* escolha a plataforma **Single-page application (SPA)** e ponha o endereço do `oauth.html`.
  Copie o *Application (client) ID* para `ONEDRIVE_CLIENT_ID` no `.env`. Em *API permissions*, adicione
  `Files.ReadWrite.AppFolder` e `User.Read` (Microsoft Graph, delegadas).
  Contas pessoais não podem mais registrar apps fora de um diretório: se o Entra avisar isso, crie
  um antes, pela conta gratuita do Azure.

## Idiomas

A interface tem português e inglês (seletor no canto da barra de cima; a escolha fica salva no
navegador). Os textos ficam em `public/js/i18n.js`: no HTML, cada texto tem uma tag `data-i18n`
com a chave, e o código usa `t('chave')`. Para adicionar um idioma, copie o bloco `pt` do
dicionário e traduza. Nomes de gravuras, categorias, terrenos e paletas usam `name` (inglês) e `name_pt` (português).

## Personalizando o estilo

- Paletas de cor: `public/js/map/palettes.js`. Copie um bloco para criar a sua.
- Tipos de terreno: `TERRAIN_TYPES`, no mesmo arquivo. O `id` é o valor salvo no projeto, então não reaproveite um id com outro significado.
- Fontes dos textos: lista `FONTS` em `public/js/main.js` e o link do Google Fonts em `index.html`.

## Estrutura

```
public/                 o site (arquivos estáticos)
  index.html, oauth.html (retorno do login do Google Drive/OneDrive), css/, assets/
  js/main.js            editor: estado, ferramentas, histórico, desenho, abrir/salvar, autosave
  js/i18n.js            textos da interface em português e inglês
  js/map/               o mapa em si
    terrain.js          grade do terreno, pincel, balde, costa, ondas e pintura
    edt.js, noise.js    distância à costa e ruído (texturas)
    palettes.js         cores e tipos de terreno
    objects.js          desenho de gravuras e textos
    assets.js           biblioteca de gravuras (manifest.json e as do usuário)
    globe.js            planeta (WebGL) e conversão tela <-> mapa
    project.js          terreno <-> PNG dentro do arquivo do projeto
  js/storage/           onde os mapas ficam
    cache.js            IndexedDB: terreno calculado e gravuras do usuário
    nextcloud.js, gdrive.js, onedrive.js   nuvens (mesma interface)
    oauth.js            login por pop-up do Google Drive e do OneDrive
    cloud-config.js     IDs dos apps (gerado pelo servidor a partir do .env)
  js/workers/           contas pesadas fora da página
    pool.js             divide uma tarefa em faixas entre vários workers
    tasks-worker.js     ruído do terreno e textura de papel
    encode-worker.js    terreno -> PNG para o autosave e o salvar
  js/ui/
    cloud-dialog.js     janela de nuvem (Salvar/Abrir)
    selection.js        contornos e caixa de seleção
    tour.js             tutorial passo a passo
server/
  server.py             servidor local (start.sh) e proxy do Nextcloud (Docker)
  nginx.conf            configuração do nginx no Docker
scripts/
  add-images.py         registra imagens novas de public/assets no manifest.json
  generate-mountains.py gera as montanhas de assets/generated
tests/                  npm test roda os dois
  test_terrain_math.js  contas otimizadas do terreno x versões diretas
  test_server.py        endereços e caminhos que o proxy precisa recusar
Dockerfile, docker-compose.yml, start.sh, .env.example
```

## Licença

O código-fonte está sob a [Licença MIT](LICENSE). As gravuras de `public/assets/ta/` (T.A. Maps, usadas
com permissão) e de `public/assets/comigo/` (CC0) mantêm as próprias licenças e não estão cobertas por
ela; veja [Créditos das gravuras](#créditos-das-gravuras) e [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
