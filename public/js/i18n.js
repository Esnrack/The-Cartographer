// UI languages. To add a language, copy the 'pt' block and translate it.
// In HTML: data-i18n="key" (text), data-i18n-html (text with tags), data-i18n-title
// (mouse tooltip) and data-i18n-placeholder. In code: t('key', { variavel }).
// Names from data (engravings, categories, terrains, palettes) use name (English) and name_pt.

const KEY = 'the-cartographer:lang';

const DICT = {
  pt: {
    language_tip: 'Idioma',
    tour: 'Tutorial',
    tour_tip: 'Passo a passo de como montar um mapa',
    tour_count: 'Passo {n} de {total}',
    tour_next: 'Próximo',
    tour_prev: 'Anterior',
    tour_skip: 'Pular tutorial',
    tour_finish: 'Começar a desenhar',
    tour_welcome_title: 'Bem-vindo ao The Cartographer',
    tour_welcome_body: 'Em poucos passos você vai ver como montar um mapa: criar, pintar o terreno, colocar gravuras e nomes, ajustar o estilo e salvar. Dá para pular a qualquer momento (ou apertar <kbd>Esc</kbd>).',
    tour_new_title: '1. Crie um mapa',
    tour_new_body: 'Em <b>Novo</b> você escolhe o tamanho e como começar: só água (você desenha a terra), só terra ou um continente aleatório para editar.',
    tour_brush_title: '2. Pinte o terreno',
    tour_brush_body: 'Com o <b>Pincel</b> (<kbd>B</kbd>), arraste sobre o mapa para criar terra. A costa, as ondas e a profundidade do mar são desenhadas sozinhas.',
    tour_terrain_title: 'Escolha o tipo de terreno',
    tour_terrain_body: 'Grama, floresta, deserto, neve… <b>Água</b> apaga terra. Para trocar o tipo sem mexer na costa, marque "Pintar só sobre terra".',
    tour_brush_opts_title: 'Ajuste o pincel',
    tour_brush_opts_body: 'Tamanho e irregularidade da borda (para um litoral recortado). Atalho: <kbd>Ctrl</kbd> + roda do mouse muda o tamanho. O modo <b>Balde</b> preenche uma região inteira.',
    tour_engraving_title: '3. Coloque gravuras',
    tour_engraving_body: 'A ferramenta <b>Gravura</b> (<kbd>S</kbd>) coloca montanhas, árvores, cidades… Clique para colocar uma, ou arraste com "Espalhar aleatoriamente" para pintar florestas e cordilheiras.',
    tour_library_title: 'Escolha na biblioteca',
    tour_library_body: 'Clique numa gravura para usá-la. Dá para buscar pelo nome e recolher categorias. Gravuras com várias versões mostram o bloco <b>Variação</b>, que também pode ser recolhido.',
    tour_own_title: 'Use suas próprias imagens',
    tour_own_body: 'Em <b>Adicionar minhas imagens…</b> você traz seus desenhos (PNG com fundo transparente, WebP, JPEG ou SVG). Eles entram em <b>Meus assets</b>, ficam só neste navegador e saem com botão direito.',
    tour_text_title: '4. Dê nomes',
    tour_text_body: 'Com <b>Texto</b> (<kbd>T</kbd>), clique no mapa para escrever nomes de reinos, mares e cidades. Fonte, tamanho, cor e curva ficam no painel.',
    tour_select_title: '5. Ajuste o que já colocou',
    tour_select_body: 'Com <b>Selecionar</b> (<kbd>V</kbd>) você move, gira, redimensiona, duplica e exclui gravuras e textos. Duplo clique num texto edita direto no mapa.',
    tour_style_title: '6. Dê o acabamento',
    tour_style_body: 'Em <b>Estilo do mapa</b>: paleta de cores, ondas na costa, textura de papel e vinheta. Mudam o mapa todo de uma vez.',
    tour_planet_title: 'Veja como planeta',
    tour_planet_body: '<b>Planeta</b> mostra o mapa como um globo, e dá para pintar nele também. Use mapas na proporção 2:1 para nada ficar esticado.',
    tour_save_title: '7. Salve',
    tour_save_body: 'O mapa já fica guardado no navegador sozinho. Em <b>Salvar</b> você guarda no dispositivo, no Nextcloud, no Google Drive ou no OneDrive (<kbd>Ctrl</kbd>+<kbd>S</kbd>).',
    tour_export_title: '8. Exporte a imagem',
    tour_export_body: '<b>Exportar PNG</b> gera a imagem final para usar onde quiser. O 2× deixa gravuras e textos mais nítidos.',
    tour_done_title: 'Pronto!',
    tour_done_body: 'Esse é o caminho. Para rever este passo a passo, use o botão <b>Tutorial</b> aqui em cima. <kbd>Ctrl</kbd>+<kbd>Z</kbd> desfaz qualquer engano.',
    new: 'Novo', new_tip: 'Novo mapa',
    open: 'Abrir', open_tip: 'Abrir projeto (.json)',
    save: 'Salvar', save_tip: 'Salvar projeto (Ctrl+S)', save_title: 'Salvar mapa', open_title: 'Abrir mapa', save_local: 'Neste dispositivo',
    export: 'Exportar PNG', export_tip: 'Exportar imagem PNG', export_scale_tip: 'Resolução da exportação',
    undo: 'Desfazer', undo_tip: 'Desfazer (Ctrl+Z)',
    redo: 'Refazer', redo_tip: 'Refazer (Ctrl+Y)',
    planet: 'Planeta', planet_tip: 'Ver e pintar o mapa como um planeta (o mapa vira uma projeção equirretangular)',
    fit: 'Ajustar à tela', fit_tip: 'Ajustar mapa à tela',

    tool_brush: 'Pincel', tool_engraving: 'Gravura', tool_text: 'Texto', tool_select: 'Selecionar', tool_expand: 'Expandir',

    terrain: 'Terreno', mode: 'Modo', mode_brush: 'Pincel', mode_bucket: 'Balde (preencher região)',
    size_radius: 'Tamanho (raio)', roughness: 'Irregularidade da borda', roughness_scale: 'Tamanho das irregularidades',
    only_land: 'Pintar só sobre terra (não mexe na costa)',
    brush_hint: 'Pinte com <b>Água</b> para apagar terra. Use <kbd>Ctrl</kbd>+roda do mouse para mudar o tamanho.',
    bucket_hint: 'Clique numa região para preenchê-la inteira com o tipo escolhido.',

    engravings: 'Gravuras', size: 'Tamanho', size_variation: 'Variação aleatória de tamanho',
    random_flip: 'Espelhar aleatoriamente', scatter: 'Espalhar aleatoriamente num raio (florestas, cordilheiras)',
    engraving_hint: 'Clique para colocar uma. Segure e arraste para colocar várias. <kbd>Ctrl</kbd>+roda do mouse muda o tamanho (ou o raio, se espalhando).',
    density: 'Densidade ao arrastar', scatter_radius: 'Raio do espalhamento', scatter_only_land: 'Espalhar só sobre terra',
    variant: 'Variação',
    assets_hint: 'As imagens ficam em <code>assets/</code> e são listadas em <code>assets/manifest.json</code>. Gravuras do T.A.\'s Mapmaking Kit: arte de <a href="https://www.patreon.com/tamaps" target="_blank" rel="noopener">T.A. Maps</a>, usadas com permissão.',
    variant_random: 'Aleatório: sorteia uma variação a cada gravura', variant_n: 'Variação {n}',
    variants_tip: '{name} ({n} variações, sorteadas ao colocar)',
    user_assets_add: 'Adicionar minhas imagens…',
    user_assets_hint: 'PNG (de preferência com fundo transparente), WebP, JPEG ou SVG, até 10 MB. Ficam só neste navegador: não são enviadas a nenhum servidor nem vão junto do mapa salvo. Botão direito numa delas para remover.',
    user_asset_tip: '{name} (sua imagem; botão direito para remover)',
    user_asset_added: '{n} imagem(ns) adicionada(s) em "Meus assets".',
    user_asset_invalid: '"{name}" não foi adicionada: use PNG, WebP, JPEG ou SVG de até 10 MB.',
    user_asset_save_failed: 'Não foi possível guardar no navegador (modo privado ou espaço cheio?).',
    user_asset_confirm_delete: 'Remover "{name}" dos seus assets? As que já estão nos mapas viram um retângulo tracejado.',
    lib_search: 'Buscar gravura (ex.: montanha, castelo)', lib_empty: 'Nenhuma gravura com esse nome.',
    packs_filter: 'Pacotes exibidos ({n} de {total})',

    text: 'Texto', font: 'Fonte', letter_spacing: 'Espaçamento entre letras', curve: 'Curva', curve_tip: 'Dobra o texto em arco: positivo curva para cima, negativo para baixo (0 = reto)', color: 'Cor',
    text_hint: 'Clique no mapa para colocar o texto. Clique num texto existente (ou dê dois cliques com Selecionar) para editá-lo direto no mapa: <kbd>Enter</kbd> confirma, <kbd>Shift+Enter</kbd> quebra linha, <kbd>Esc</kbd> cancela.',
    example_text: 'Reino de Exemplo',

    selection: 'Seleção',
    selection_hint: 'Clique numa gravura ou texto para selecionar, ou arraste numa área vazia para selecionar tudo dentro da caixa. <kbd>Shift</kbd>+clique adiciona ou remove da seleção. Arraste para mover, <kbd>Delete</kbd> exclui, <kbd>Ctrl+D</kbd> duplica, <kbd>Ctrl+C</kbd>/<kbd>Ctrl+V</kbd> copia e cola.',
    selection_multi: '{n} objetos selecionados. Arraste qualquer um para mover todos.',
    rotation: 'Rotação', flipped: 'Espelhado', duplicate: 'Duplicar', delete: 'Excluir',

    expand_title: 'Expandir mapa',
    expand_hint: 'Arraste as alças douradas nas bordas do mapa para aumentá-lo para qualquer lado. A área nova começa como água e o que já está desenhado fica no lugar. <kbd>Ctrl+Z</kbd> desfaz.',

    map_style: 'Estilo do mapa', palette: 'Paleta', waves: 'Ondas na costa', wave_spacing: 'Distância entre ondas',
    wave_strength: 'Intensidade das ondas', sea_depth: 'Profundidade do mar', land_outline: 'Contorno da terra',
    paper_texture: 'Textura de papel', vignette: 'Vinheta', engraving_shadows: 'Sombra nas gravuras',

    reference: 'Imagem de referência',
    reference_hint: 'Carregue um rascunho ou mapa para usar como decalque. A imagem não é salva no projeto.',
    reference_load: 'Carregar imagem…', reference_visible: 'Mostrar sobre o mapa', opacity: 'Opacidade',
    reference_convert: 'Converter em terreno', reference_convert_tip: 'Detecta terra, água e neve pelas cores da imagem', reference_remove: 'Remover',

    cloud_login_hint: 'O login acontece na página do próprio Nextcloud, numa nova aba. Os mapas ficam na pasta <b>Mapas</b> da sua conta.',
    cloud_server: 'Endereço do seu Nextcloud', connect: 'Conectar', save_as: 'Salvar o mapa atual como', cloud_name_placeholder: 'meu-mapa.json',
    cloud_save: 'Salvar no {p}', cloud_list_title: 'Mapas salvos', disconnect: 'Desconectar', close: 'Fechar',

    new_title: 'Novo mapa', opt_square: '2000 × 2000 (quadrado)', opt_large: '3200 × 2400 (4:3 grande)',
    opt_planet: '4000 × 2000 (2:1, ideal para planeta)', opt_custom: 'Personalizado…',
    width: 'Largura', height: 'Altura', start_with: 'Começar com',
    only_water: 'Só água (desenhe a terra)', only_land_start: 'Só terra (desenhe a água)', random_continent: 'Continente aleatório',
    new_warning: 'O mapa atual será substituído. Salve antes se quiser mantê-lo.', cancel: 'Cancelar', create: 'Criar',

    msg_pick_engraving: 'Escolha uma gravura na biblioteca ao lado.',
    msg_type_text: 'Digite o texto no painel ao lado.',
    msg_expand_to: 'Expandir para {w} × {h}',
    msg_copied: '{n} objeto(s) copiado(s).',
    msg_ratio_tip: 'Dica: a imagem tem proporção diferente do mapa. Crie um mapa com a mesma proporção para decalcar sem bordas.',
    confirm_convert: 'Substituir o terreno atual pelo terreno detectado na imagem? (Pode desfazer com Ctrl+Z)',
    msg_opened: 'Projeto "{name}" aberto.',
    alert_open_failed: 'Não foi possível abrir o projeto: {msg}',
    msg_map_size: 'Mapa agora tem {w} × {h}.',
    msg_terrain_converted: 'Terreno convertido. Ajuste os detalhes com o pincel.',
    error_not_project: 'o arquivo não é um projeto do The Cartographer',
    msg_autosave_failed: 'Não foi possível salvar automaticamente no navegador. Use "Salvar".',
    msg_saving: 'Salvando…', msg_saved: 'Projeto salvo.', msg_generating: 'Gerando imagem…', msg_exported: 'Imagem exportada.',
    msg_manifest_error: 'Erro ao carregar assets/manifest.json: {msg}',
    alert_webgl: 'Seu navegador não tem suporte a WebGL 2, necessário para a visualização em planeta.',

    cloud_connected_as: 'Conectado como {u} em {s}.', cloud_loading: 'Carregando…', cloud_empty: 'Nenhum mapa salvo ainda.',
    cloud_open_tip: 'Abrir este mapa (substitui o mapa atual)', cloud_opened: '"{name}" aberto do {p}.',
    cloud_not_connected: 'Não conectado.', cloud_waiting: 'Faça o login na aba que abriu e autorize o acesso…',
    cloud_disconnected: 'Desconectado. Este navegador não guarda mais o acesso ao {p}.',
    cloud_saved: '"{name}" salvo no {p}.',
    oauth_login_hint: 'O login acontece num pop-up do {p}. O site só tem acesso aos mapas que ele mesmo salvar lá, nada mais da sua conta. A conexão vale por cerca de 1 hora.',
    oauth_not_configured: '{p} não está configurado neste site (falta o ID do app no .env do servidor).',
    oauth_expired: 'A conexão com o {p} expirou. Conecte de novo.',
    oauth_failed: 'O {p} recusou o pedido (HTTP {s}).',
    oauth_popup_blocked: 'O navegador bloqueou o pop-up de login. Libere pop-ups para este site e tente de novo.',
    nc_not_connected: 'Não conectado ao Nextcloud.',
    nc_expired: 'A conexão com o Nextcloud expirou ou foi revogada. Conecte de novo.',
    nc_denied: 'Acesso negado pelo proxy ou pelo Nextcloud.',
    nc_no_proxy: 'Este servidor não tem o proxy do Nextcloud. Rode o site com ./start.sh ou pelo Docker (não com python3 -m http.server).',
    nc_bad_server: 'Endereço não aceito. Digite o endereço completo do seu Nextcloud na internet, começando com https:// (ex.: https://nuvem.exemplo.com), sem porta.',
    nc_unreachable: 'Não foi possível acessar o Nextcloud nesse endereço.',
    nc_unavailable: 'Nextcloud indisponível (HTTP {s}).',
    nc_cancelled: 'Login cancelado.', nc_timeout: 'Tempo esgotado esperando o login.',
    nc_list_failed: 'Não foi possível listar os mapas (HTTP {s}).',
    nc_open_failed: 'Não foi possível abrir "{name}" (HTTP {s}).',
    nc_save_failed: 'Não foi possível salvar "{name}" (HTTP {s}).',
  },

  en: {
    language_tip: 'Language',
    tour: 'Tutorial',
    tour_tip: 'Step by step: how to build a map',
    tour_count: 'Step {n} of {total}',
    tour_next: 'Next',
    tour_prev: 'Back',
    tour_skip: 'Skip tutorial',
    tour_finish: 'Start drawing',
    tour_welcome_title: 'Welcome to The Cartographer',
    tour_welcome_body: 'In a few steps you will see how to build a map: create it, paint the terrain, place engravings and names, adjust the style and save. You can skip at any time (or press <kbd>Esc</kbd>).',
    tour_new_title: '1. Create a map',
    tour_new_body: 'In <b>New</b> you choose the size and how to start: only water (you draw the land), only land, or a random continent to edit.',
    tour_brush_title: '2. Paint the terrain',
    tour_brush_body: 'With the <b>Brush</b> (<kbd>B</kbd>), drag over the map to create land. The coast, waves and sea depth are drawn on their own.',
    tour_terrain_title: 'Pick the terrain type',
    tour_terrain_body: 'Grass, forest, desert, snow… <b>Water</b> erases land. To change the type without touching the coast, check "Paint over land only".',
    tour_brush_opts_title: 'Adjust the brush',
    tour_brush_opts_body: 'Size and edge roughness (for a jagged coastline). Shortcut: <kbd>Ctrl</kbd> + mouse wheel changes the size. <b>Bucket</b> mode fills a whole region.',
    tour_engraving_title: '3. Place engravings',
    tour_engraving_body: 'The <b>Engraving</b> tool (<kbd>S</kbd>) places mountains, trees, cities… Click to place one, or drag with "Scatter randomly" to paint forests and mountain ranges.',
    tour_library_title: 'Pick from the library',
    tour_library_body: 'Click an engraving to use it. You can search by name and collapse categories. Engravings with several versions show the <b>Variant</b> block, which can be collapsed too.',
    tour_own_title: 'Use your own images',
    tour_own_body: 'With <b>Add my images…</b> you bring in your own drawings (PNG with a transparent background, WebP, JPEG or SVG). They go into <b>My assets</b>, stay in this browser only and are removed with a right-click.',
    tour_text_title: '4. Name things',
    tour_text_body: 'With <b>Text</b> (<kbd>T</kbd>), click the map to write names of kingdoms, seas and cities. Font, size, color and curve are in the panel.',
    tour_select_title: '5. Adjust what you placed',
    tour_select_body: 'With <b>Select</b> (<kbd>V</kbd>) you move, rotate, resize, duplicate and delete engravings and texts. Double-click a text to edit it right on the map.',
    tour_style_title: '6. Finishing touches',
    tour_style_body: 'In <b>Map style</b>: color palette, coastal waves, paper texture and vignette. They change the whole map at once.',
    tour_planet_title: 'See it as a planet',
    tour_planet_body: '<b>Planet</b> shows the map as a globe, and you can paint on it too. Use maps with a 2:1 ratio so nothing gets stretched.',
    tour_save_title: '7. Save',
    tour_save_body: 'The map is already kept in the browser automatically. In <b>Save</b> you store it on this device, Nextcloud, Google Drive or OneDrive (<kbd>Ctrl</kbd>+<kbd>S</kbd>).',
    tour_export_title: '8. Export the image',
    tour_export_body: '<b>Export PNG</b> produces the final image to use anywhere. 2× makes engravings and texts sharper.',
    tour_done_title: 'All set!',
    tour_done_body: 'That is the path. To see this walkthrough again, use the <b>Tutorial</b> button up here. <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes any mistake.',
    new: 'New', new_tip: 'New map',
    open: 'Open', open_tip: 'Open project (.json)',
    save: 'Save', save_tip: 'Save project (Ctrl+S)', save_title: 'Save map', open_title: 'Open map', save_local: 'On this device',
    export: 'Export PNG', export_tip: 'Export PNG image', export_scale_tip: 'Export resolution',
    undo: 'Undo', undo_tip: 'Undo (Ctrl+Z)',
    redo: 'Redo', redo_tip: 'Redo (Ctrl+Y)',
    planet: 'Planet', planet_tip: 'View and paint the map as a planet (the map becomes an equirectangular projection)',
    fit: 'Fit to screen', fit_tip: 'Fit map to screen',

    tool_brush: 'Brush', tool_engraving: 'Engraving', tool_text: 'Text', tool_select: 'Select', tool_expand: 'Expand',

    terrain: 'Terrain', mode: 'Mode', mode_brush: 'Brush', mode_bucket: 'Bucket (fill region)',
    size_radius: 'Size (radius)', roughness: 'Edge roughness', roughness_scale: 'Roughness scale',
    only_land: 'Paint only over land (keeps the coastline)',
    brush_hint: 'Paint with <b>Water</b> to erase land. Use <kbd>Ctrl</kbd>+mouse wheel to change the size.',
    bucket_hint: 'Click a region to fill all of it with the chosen type.',

    engravings: 'Engravings', size: 'Size', size_variation: 'Random size variation',
    random_flip: 'Randomly flip', scatter: 'Scatter randomly within a radius (forests, mountain ranges)',
    engraving_hint: 'Click to place one. Hold and drag to place several. <kbd>Ctrl</kbd>+mouse wheel changes the size (or the radius, when scattering).',
    density: 'Density when dragging', scatter_radius: 'Scatter radius', scatter_only_land: 'Scatter only over land',
    variant: 'Variant',
    assets_hint: 'Images live in <code>assets/</code> and are listed in <code>assets/manifest.json</code>. T.A.\'s Mapmaking Kit engravings: art by <a href="https://www.patreon.com/tamaps" target="_blank" rel="noopener">T.A. Maps</a>, used with permission.',
    variant_random: 'Random: picks a variant for each engraving', variant_n: 'Variant {n}',
    variants_tip: '{name} ({n} variants, picked at random when placed)',
    user_assets_add: 'Add my images…',
    user_assets_hint: 'PNG (ideally with a transparent background), WebP, JPEG or SVG, up to 10 MB. They stay in this browser only: they are not uploaded anywhere and are not included in saved maps. Right-click one to remove it.',
    user_asset_tip: '{name} (your image; right-click to remove)',
    user_asset_added: '{n} image(s) added to "My assets".',
    user_asset_invalid: '"{name}" was not added: use PNG, WebP, JPEG or SVG up to 10 MB.',
    user_asset_save_failed: 'Could not store it in the browser (private mode or storage full?).',
    user_asset_confirm_delete: 'Remove "{name}" from your assets? The ones already on maps become a dashed box.',
    lib_search: 'Search engravings (e.g. mountain, castle)', lib_empty: 'No engraving with that name.',
    packs_filter: 'Packs shown ({n} of {total})',

    text: 'Text', font: 'Font', letter_spacing: 'Letter spacing', curve: 'Curve', curve_tip: 'Bends the text into an arc: positive curves up, negative curves down (0 = straight)', color: 'Color',
    text_hint: 'Click the map to place the text. Click an existing text (or double-click with Select) to edit it right on the map: <kbd>Enter</kbd> confirms, <kbd>Shift+Enter</kbd> adds a line break, <kbd>Esc</kbd> cancels.',
    example_text: 'Example Kingdom',

    selection: 'Selection',
    selection_hint: 'Click an engraving or text to select it, or drag over an empty area to select everything inside the box. <kbd>Shift</kbd>+click adds to or removes from the selection. Drag to move, <kbd>Delete</kbd> removes, <kbd>Ctrl+D</kbd> duplicates, <kbd>Ctrl+C</kbd>/<kbd>Ctrl+V</kbd> copy and paste.',
    selection_multi: '{n} objects selected. Drag any of them to move them all.',
    rotation: 'Rotation', flipped: 'Flipped', duplicate: 'Duplicate', delete: 'Delete',

    expand_title: 'Expand map',
    expand_hint: 'Drag the golden handles on the map edges to enlarge it in any direction. The new area starts as water and what is already drawn stays in place. <kbd>Ctrl+Z</kbd> undoes it.',

    map_style: 'Map style', palette: 'Palette', waves: 'Coastal waves', wave_spacing: 'Wave spacing',
    wave_strength: 'Wave intensity', sea_depth: 'Sea depth', land_outline: 'Land outline',
    paper_texture: 'Paper texture', vignette: 'Vignette', engraving_shadows: 'Engraving shadows',

    reference: 'Reference image',
    reference_hint: 'Load a sketch or map to trace over. The image is not saved in the project.',
    reference_load: 'Load image…', reference_visible: 'Show over the map', opacity: 'Opacity',
    reference_convert: 'Convert to terrain', reference_convert_tip: 'Detects land, water and snow from the image colors', reference_remove: 'Remove',

    cloud_login_hint: 'You log in on the Nextcloud page itself, in a new tab. Maps are kept in the <b>Mapas</b> folder of your account.',
    cloud_server: 'Your Nextcloud address', connect: 'Connect', save_as: 'Save the current map as', cloud_name_placeholder: 'my-map.json',
    cloud_save: 'Save to {p}', cloud_list_title: 'Saved maps', disconnect: 'Disconnect', close: 'Close',

    new_title: 'New map', opt_square: '2000 × 2000 (square)', opt_large: '3200 × 2400 (4:3 large)',
    opt_planet: '4000 × 2000 (2:1, best for planets)', opt_custom: 'Custom…',
    width: 'Width', height: 'Height', start_with: 'Start with',
    only_water: 'Only water (draw the land)', only_land_start: 'Only land (draw the water)', random_continent: 'Random continent',
    new_warning: 'The current map will be replaced. Save it first if you want to keep it.', cancel: 'Cancel', create: 'Create',

    msg_pick_engraving: 'Pick an engraving from the library on the side.',
    msg_type_text: 'Type the text in the side panel.',
    msg_expand_to: 'Expand to {w} × {h}',
    msg_copied: '{n} object(s) copied.',
    msg_ratio_tip: 'Tip: the image has a different aspect ratio than the map. Create a map with the same ratio to trace without borders.',
    confirm_convert: 'Replace the current terrain with the terrain detected in the image? (You can undo with Ctrl+Z)',
    msg_opened: 'Project "{name}" opened.',
    alert_open_failed: 'Could not open the project: {msg}',
    msg_map_size: 'The map is now {w} × {h}.',
    msg_terrain_converted: 'Terrain converted. Refine the details with the brush.',
    error_not_project: 'the file is not a The Cartographer project',
    msg_autosave_failed: 'Could not autosave in the browser. Use "Save".',
    msg_saving: 'Saving…', msg_saved: 'Project saved.', msg_generating: 'Generating image…', msg_exported: 'Image exported.',
    msg_manifest_error: 'Error loading assets/manifest.json: {msg}',
    alert_webgl: 'Your browser does not support WebGL 2, which the planet view needs.',

    cloud_connected_as: 'Connected as {u} on {s}.', cloud_loading: 'Loading…', cloud_empty: 'No maps saved yet.',
    cloud_open_tip: 'Open this map (replaces the current map)', cloud_opened: '"{name}" opened from {p}.',
    cloud_not_connected: 'Not connected.', cloud_waiting: 'Log in on the tab that opened and authorize access…',
    cloud_disconnected: 'Disconnected. This browser no longer keeps access to {p}.',
    cloud_saved: '"{name}" saved to {p}.',
    oauth_login_hint: 'You log in on a {p} pop-up. The site can only access the maps it saves there, nothing else in your account. The connection lasts about 1 hour.',
    oauth_not_configured: '{p} is not set up on this site (the app ID is missing from the server\'s .env).',
    oauth_expired: 'The {p} connection expired. Connect again.',
    oauth_failed: '{p} refused the request (HTTP {s}).',
    oauth_popup_blocked: 'The browser blocked the login pop-up. Allow pop-ups for this site and try again.',
    nc_not_connected: 'Not connected to Nextcloud.',
    nc_expired: 'The Nextcloud connection expired or was revoked. Connect again.',
    nc_denied: 'Access denied by the proxy or by Nextcloud.',
    nc_no_proxy: 'This server has no Nextcloud proxy. Run the site with ./start.sh or with Docker (not with python3 -m http.server).',
    nc_bad_server: 'Address not accepted. Type the full address of your Nextcloud on the internet, starting with https:// (e.g. https://cloud.example.com), without a port.',
    nc_unreachable: 'Could not reach a Nextcloud at that address.',
    nc_unavailable: 'Nextcloud unavailable (HTTP {s}).',
    nc_cancelled: 'Login cancelled.', nc_timeout: 'Timed out waiting for the login.',
    nc_list_failed: 'Could not list the maps (HTTP {s}).',
    nc_open_failed: 'Could not open "{name}" (HTTP {s}).',
    nc_save_failed: 'Could not save "{name}" (HTTP {s}).',
  },
};

export const LANGUAGES = { pt: 'Português', en: 'English' };

function initialLanguage() {
  try {
    const saved = localStorage.getItem(KEY);
    if (DICT[saved]) return saved;
  } catch { /* no localStorage */ }
  return (navigator.language || '').toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

export let lang = initialLanguage();

export function setLang(code) {
  if (!DICT[code]) return;
  lang = code;
  try { localStorage.setItem(KEY, code); } catch { /* no localStorage */ }
  applyLanguage();
}

export function t(key, vars = {}) {
  const s = DICT[lang][key] ?? DICT.pt[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}

// Name of something from data (manifest, terrains, palettes): name_pt in Portuguese, if present.
export const localName = (obj) => (lang === 'pt' && obj.name_pt) || obj.name;

export function applyLanguage(root = document) {
  document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang;
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
}
