# Otakulogia — Addon para Stremio

Este projeto fornece um addon HTTP compatível com o Stremio, consumindo os dados públicos expostos pela API do Otakulogia. O addon cria catálogos separados por lançamentos e gêneros, mantém o título como uma **série** e expõe cada episódio com `season` e `episode`, evitando que todos os vídeos sejam tratados como um único filme.

> **Uso responsável:** o projeto não contorna login, paywall, DRM, CAPTCHA ou qualquer proteção técnica. Utilize-o somente quando tiver autorização para consumir e redistribuir os conteúdos e respeite os termos do site e os direitos dos titulares.

## Instalação local

É necessário Node.js 18 ou superior. Execute:

```bash
npm install
npm start
```

O addon ficará disponível em `http://localhost:7000/manifest.json`. No Stremio, abra a tela de addons, escolha instalar por URL e informe essa URL.

## Deploy no Render

Crie um repositório no GitHub contendo estes arquivos e, no Render, escolha **New Web Service** apontando para o repositório. O Render pode usar os valores abaixo:

| Configuração | Valor |
|---|---|
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Plano | Free ou o plano escolhido pelo usuário |
|

Após o deploy, teste `https://SEU-SERVICO.onrender.com/health` e instale no Stremio usando `https://SEU-SERVICO.onrender.com/manifest.json`.

## Rotas principais

| Rota | Finalidade |
|---|---|
| `/manifest.json` | Manifesto do addon para o Stremio |
| `/catalog/series/latest.json` | Últimos lançamentos |
| `/catalog/series/acao.json` | Catálogo por gênero |
| `/catalog/series/dub.json` | Catálogo de animes dublados da categoria `/categoria/dub` |
| `/catalog/series/latest/search=termo.json` | Busca enviada pelo Stremio/Nuvio |
| `/catalog/series/{slug}.json?search=termo` | Busca alternativa por query string |
| `/meta/series/otaku:{slug}.json` | Metadados da série e lista de vídeos |
| `/stream/series/otaku:{slug}:s{temporada}:e{id}.json` | Stream do episódio individual |
| `/health` | Verificação de saúde |
|

Os catálogos configurados incluem Otakulogia - Últimos lançamentos, Otakulogia - Ação, Otakulogia - Shounen, Otakulogia - Fantasia, Otakulogia - Comédia, Otakulogia - Aventura, Otakulogia - Drama, Otakulogia - Romance, Otakulogia - Sci-Fi, Otakulogia - Sobrenatural, Otakulogia - Slice of Life, Otakulogia - Mistério, Otakulogia - Ecchi, Otakulogia - Mecha, Otakulogia - Dublado e Otakulogia - Anime Chinês / Donghua. O catálogo Dublado utiliza o slug oficial `dub`, correspondente à página de animes dublados do site. Todos declaram `extra: search` e `extra: skip`, conforme o protocolo oficial do Stremio, e o servidor aceita o formato de rota `/catalog/series/{catalogo}/search={termo}.json` usado pelos clientes.

## Como a separação funciona

O addon consulta as temporadas e episódios no detalhe do título. Cada vídeo recebe um ID próprio no formato `otaku:{slug}:s{temporada}:e{identificador}:a{audio}`. O identificador físico do episódio (`upstreamId`) é usado diretamente na rota de stream, evitando que o episódio 1 seja reutilizado para os demais. O número do episódio é extraído do título oficial (`EP. 01`, `EP. 02` etc.), pois em alguns títulos a API retorna um número agregado que não representa o episódio exibido.

Quando existem versões diferentes, o addon mantém os vídeos separados com os rótulos `[Dublado]` e `[Legendado]`. O tipo de áudio também participa do ID e do grupo de reprodução, impedindo colisões entre as duas versões. A resposta de metadados inclui `videos`, que é o formato reconhecido pelo Stremio para exibir episódios individualmente dentro de uma série.

O endpoint de stream escolhe, nesta ordem, a URL FHD, a URL padrão e a URL SD que a fonte pública retornar. O addon não hospeda nem reempacota o vídeo; ele entrega ao Stremio o endereço público fornecido pela fonte.

## Variáveis opcionais

| Variável | Padrão | Descrição |
|---|---:|---|
| `PORT` | `7000` | Porta HTTP utilizada pelo serviço |
| `PAGE_SIZE` | `100` | Quantidade máxima de itens por catálogo |
| `CACHE_TTL_MS` | `300000` | Tempo de cache das respostas da API |
|
## Observações de operação

O Render Free pode suspender o serviço quando não houver tráfego, produzindo uma demora no primeiro acesso. Se a fonte alterar o formato da API ou deixar de fornecer uma URL pública de vídeo, será necessário atualizar o adaptador. O addon depende da disponibilidade da API pública do Otakulogia e não consegue garantir reprodução quando a fonte restringe o acesso.
