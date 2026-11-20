-- Cadastro de receitas na tabela `recipes` (MySQL).
-- Fontes: "Livro de Receitas" da Oficina de Culinária (246 receitas)
--         e ebook "15 receitas em 15 minutos" (15 receitas). Total: 261.
--
-- * `preparation`: um passo por linha (o app quebra o texto por "\n" e numera os passos).
-- * `category`: cafe | almoco | jantar | lanche (NULL = bases como molhos e farinhas).
-- * `description`: seção do livro · grupo/condição a que a receita se destina.
-- * Os ids são UUIDs fixos derivados do título, e o INSERT IGNORE torna o script seguro
--   para rodar mais de uma vez (receitas já inseridas são ignoradas).
--
-- phpMyAdmin: selecione antes o banco de dados do app na barra lateral e use
-- Importar (conjunto de caracteres do arquivo: utf-8) ou cole o conteúdo na aba SQL.

SET NAMES utf8mb4;

START TRANSACTION;

-- 1. Creme de couve-flor com alho-poró
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('abff4709-e2f6-556b-991d-3585c645e72c', 'Creme de couve-flor com alho-poró', 'Entrada · Alimentos funcionais', '["1 colher (sopa) de azeite","1 cebola pequena picada","1 dente de alho picado","1 maço de couve-flor","4 colheres (sopa) de alho-poró","1 colher (sobremesa) de cebolinha picada","500 ml de água quente","Sal e pimenta a gosto"]', 'Refogue a cebola e o alho no azeite.
Acrescente a couve-flor e a água quente.
Assim que estiver cozida, bata no liquidificador e acrescente o sal e a pimenta.
Volte para a panela e adicione o alho-poró e a cebolinha.
Cozinhe por mais 5 minutos e sirva a seguir.', NULL, NULL, 2, 113, 'jantar', TRUE);

-- 2. Quibe de grão-de-bico
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('4fb88e81-a772-57bb-949a-354c132c7588', 'Quibe de grão-de-bico', 'Entrada · Anemia', '["1 xícara (chá) de grão-de-bico","1 xícara (chá) de trigo para quibe","1/4 de xícara (chá) de azeite","3 colheres (sopa) de tahine","3 dentes de alho picados","1 cebola grande picada","1 xícara (chá) de farinha de trigo integral","1 xícara (chá) de salsinha picada","Sal a gosto"]', 'Em uma vasilha, coloque o trigo e deixe de molho até ficar hidratado. Retire o excesso de água e reserve.
Bata no liquidificador o grão-de-bico, o azeite, o tahine, o alho, a cebola e o sal até obter uma mistura homogênea.
Em uma vasilha, coloque o creme de grão-de-bico e o trigo, adicione a farinha integral e a salsinha picada.
Unte uma assadeira com azeite, coloque a mistura e asse em forno médio preaquecido por cerca de 1 hora ou até dourar.', NULL, NULL, 5, 203, 'lanche', TRUE);

-- 3. Salada verde com molho de maracujá
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('806032df-d286-5e29-b35d-cf4d7073aae5', 'Salada verde com molho de maracujá', 'Entrada · Anemia', '["Salada: 1 maço pequeno de alface americana","Salada: 1 maço pequeno de rúcula","Salada: 1 maço pequeno de brócolis cozido","Salada: 2 cenouras raladas","Salada: 10 tomates-cereja","Molho: 200 ml de azeite de oliva","Molho: 1 colher (sopa) de mostarda amarela","Molho: pimenta e sal a gosto","Molho: suco de 1/2 limão","Molho: 2 maracujás (polpa com as sementes)","Molho: 2 colheres (sobremesa) de mel"]', 'Molho: em um recipiente, coloque o azeite, a mostarda, o limão, o sal e a pimenta. Misture bem, adicione a polpa do maracujá e o mel e reserve.
Salada: em uma saladeira, misture todos os ingredientes e regue com o molho.
Sirva a seguir.', NULL, NULL, 8, 121, 'almoco', TRUE);

-- 4. Bolinhos de folhas de beterraba
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('f5c9c41d-edbc-5a94-ab67-e21d947bc0d5', 'Bolinhos de folhas de beterraba', 'Entrada · Aproveitamento integral dos alimentos', '["1 copo de folhas de beterraba picadas","2 ovos","5 colheres (sopa) de farinha de trigo","2 colheres (sopa) de água","Cebola picada","Sal a gosto"]', 'Bata bem os ovos e misture os outros ingredientes.
Asse os bolinhos em forno médio (200 °C) por aproximadamente 30 minutos.', NULL, NULL, 10, 70, 'lanche', TRUE);

-- 5. Mandioca com talos gratinados
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('508d752e-0244-53bb-a0fe-ff785a01d05a', 'Mandioca com talos gratinados', 'Entrada · Aproveitamento integral dos alimentos', '["1 kg de mandioca cozida","2 colheres (sopa) de margarina","1/2 L de leite","Recheio: talos e folhas de espinafre, beterraba, couve-flor e nabo","Recheio: 2 colheres (sopa) de óleo","Recheio: alho, cebola e sal a gosto"]', 'Bata a mandioca no liquidificador até formar um purê.
Leve ao fogo junto com a margarina até ferver, com sal a gosto. Reserve.
Faça um refogado com alho, cebola e os talos.
Em um refratário, coloque metade do purê de mandioca, depois o refogado de folhas e por último a outra metade do purê.
Leve ao forno (180 °C) para gratinar por 10 minutos.', 'O nabo pode ser utilizado em saladas, como ingrediente de sopas, em preparações refogadas ou em forma de purê.', NULL, 10, 180, 'almoco', TRUE);

-- 6. Quibe de quinoa com brócolis
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('5e3a1323-e63b-5fdf-8f3b-69e260c2aa3e', 'Quibe de quinoa com brócolis', 'Entrada · Cabeça e pescoço', '["Quibe: 1/2 xícara (chá) de quinoa","Quibe: 500 g de carne moída","Quibe: 2 colheres (sopa) de hortelã picada","Quibe: 1 limão (suco)","Recheio: 200 g de brócolis cozido picado","Recheio: 2 tomates picados","Recheio: 1 cebola picada","Recheio: 1 dente de alho picado","Recheio: 1/2 xícara (chá) de queijo branco picado","Azeite para untar","Sal a gosto"]', 'Deixe a quinoa de molho na água por cerca de 2 horas.
Misture a carne, a hortelã, o suco de limão, a quinoa e o sal e reserve.
Para o recheio, misture o brócolis, os tomates, a cebola, o alho e o queijo branco.
Unte uma assadeira com azeite, disponha metade da mistura de carne com quinoa, coloque o recheio e cubra com o restante da carne.
Asse por cerca de 40 minutos.', NULL, NULL, 10, 187, 'almoco', TRUE);

-- 7. Torradas de espinafre
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('fd2042fd-0537-5a60-b352-216cba4ba4fe', 'Torradas de espinafre', 'Entrada · Cabeça e pescoço', '["Torradas: 1 colher (sopa) de farinha de trigo","Torradas: 1 colher (sopa) de salsa","Torradas: 1 colher (sopa) de ricota","Torradas: sal a gosto","Torradas: margarina light para untar","Torradas: 1 colher (sopa) de azeite","Torradas: 2 maços de espinafre","Torradas: 1 colher (sopa) de cebola ralada","Torradas: 3 claras","Torradas: 1 gema","Cobertura: 200 g de tomate seco","Cobertura: 150 g de queijo cottage","Cobertura: sal a gosto"]', 'Refogue o espinafre com o azeite até murchar. Bata no liquidificador até formar uma pasta e reserve.
Em outro recipiente, misture a cebola, as claras, a gema, a farinha de trigo, a salsa, a ricota e o sal e junte à pasta de espinafre.
Misture bem e leve ao forno por 20 minutos em uma assadeira untada.
Espere esfriar e corte em quadradinhos.
Para a cobertura, bata o tomate seco, o queijo cottage e o sal.
Cubra os quadradinhos com o creme formado e leve ao forno por 5 minutos. Sirva ainda quente.', NULL, NULL, 6, 99, 'lanche', TRUE);

-- 8. Caldo de carne
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('26f15857-2a7e-557a-98ac-df5a74fe1ee8', 'Caldo de carne', 'Entrada · Caldos e sopas', '["1 kg de aparas de carne","2 colheres (sopa) de óleo","300 g de cebola em cubos","6 folhas de alho-poró","100 g de salsão picado","1 colher (sopa) de extrato de tomate","1 folha de louro","1 ramo de tomilho","6 cravos-da-índia","1 ramo de alecrim","2 dentes de alho","3 talos de salsa","7 L de água"]', 'Em uma panela, aqueça o óleo e doure a carne.
Junte os legumes e refogue até obter uma coloração dourada.
Acrescente a água, o extrato de tomate e todos os outros temperos.
Cozinhe em fogo baixo por 4 a 5 horas, reduzindo quase à metade.
Coe e armazene em garrafas plásticas; se preferir, reduza e congele.', NULL, NULL, 4, 159, 'jantar', TRUE);

-- 9. Caldo de legumes
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('26f66ea2-7789-53e8-9bef-bb3fc4e9e1f8', 'Caldo de legumes', 'Entrada · Caldos e sopas', '["300 g de cebola em cubos","500 g de cenoura em cubos","6 folhas de alho-poró","200 g de salsão picado","6 folhas de couve ou outra folha disponível","1 ramo de tomilho","1 ramo de alecrim","2 dentes de alho","3 talos de salsa","7 L de água"]', 'Em uma panela, junte os legumes e refogue até que fiquem dourados.
Acrescente a água e as ervas e deixe ferver lentamente por cerca de 1 hora.
Coe e armazene em garrafas plásticas; se preferir, reduza e congele.', NULL, NULL, NULL, NULL, 'jantar', TRUE);

-- 10. Canja
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('a0d081a8-5bf0-5d88-98d7-097a45a7ae91', 'Canja', 'Entrada · Caldos e sopas', '["375 g de cenoura em cubos","1 kg de peito de frango com osso","1 1/2 L de água","15 g de cebola","400 g de batata em cubos","20 g de sal","10 ml de óleo","200 g de arroz","30 g de salsão","Salsinha picada para decorar"]', 'Refogue a cebola no óleo até ficar dourada.
Junte o peito de frango e doure mais.
Acrescente a água e os talos de salsão e cozinhe por cerca de 40 minutos.
Quando o frango estiver cozido, retire-o do caldo, desfie e volte para o caldo, acrescentando o arroz, a cenoura e a batata.
Deixe cozinhar por 40 minutos ou até que o arroz esteja bem cozido.
Por último, acerte o sal. Sirva quente com salsinha picada.', NULL, NULL, 5, 371, 'jantar', TRUE);

-- 11. Misso shiru
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('2cbdace6-1332-5f94-9f75-4864cbb67a44', 'Misso shiru', 'Entrada · Caldos e sopas', '["4 xícaras (chá) de água (800 ml)","1 sachê de caldo dashi em pó","3 colheres (sopa) de missô","170 g de tofu cortado em cubos","3 colheres (sopa) de cebolinha em rodelas"]', 'Em uma panela média, coloque a água e leve ao fogo alto para aquecer.
Ao levantar fervura, junte o caldo dashi e misture bem.
Em uma tigela pequena, separe um pouco do caldo e dissolva o missô. Adicione essa mistura novamente ao restante do caldo.
Acrescente o tofu e a cebolinha e sirva em seguida.', NULL, NULL, 4, 65, 'jantar', TRUE);

-- 12. Sopa de cenoura, abóbora e laranja
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('121ad1dc-9e45-5104-9fe7-afb1b2577fbc', 'Sopa de cenoura, abóbora e laranja', 'Entrada · Caldos e sopas', '["1 cebola média ralada","2 colheres (sopa) de óleo","2 dentes de alho picadinhos","500 g de cenoura descascada","500 g de abóbora descascada","1 colher (sopa) de raspas de laranja","1 1/2 L de caldo de legumes","Iogurte batido para servir","Sal"]', 'Aqueça o óleo e junte a cebola e o alho, suando até ficarem transparentes.
Junte o caldo, a cenoura, a abóbora e as raspas de laranja e cozinhe lentamente por cerca de 30 minutos ou até ficar bem macio.
Bata tudo no liquidificador, acerte o sal e, se necessário, acrescente mais caldo, deixando cremoso.
Sirva com uma colherada de iogurte por cima.', NULL, NULL, 5, 12, 'jantar', TRUE);

-- 13. Sopa de ervilha
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('242ebad1-f73a-5a08-9a67-cfa08b798f95', 'Sopa de ervilha', 'Entrada · Caldos e sopas', '["1 cebola média ralada","2 colheres (sopa) de óleo","2 batatas médias descascadas e em cubos","400 g de ervilha seca lavada","1 pau de canela","1 1/2 L de caldo de legumes","Sal"]', 'Aqueça o óleo e junte a cebola, suando até ficar transparente.
Junte o caldo, a ervilha, a batata e o pau de canela e cozinhe lentamente por cerca de 30 minutos ou até que a ervilha esteja macia.
Retire o pau de canela.
Bata tudo no liquidificador, acerte o sal e, se necessário, acrescente mais caldo, deixando cremoso.', NULL, NULL, 6, 87, 'jantar', TRUE);

-- 14. Sopa de mandioquinha e espinafre
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('0a5d3cd4-8b32-514c-b524-42a607b42a21', 'Sopa de mandioquinha e espinafre', 'Entrada · Caldos e sopas', '["1 cebola média ralada","2 colheres (sopa) de óleo","2 dentes de alho picadinhos","700 g de mandioquinha descascada","400 g de folhas de espinafre","2 galhos de alecrim","1 1/2 L de caldo de legumes","Sal"]', 'Aqueça o óleo, junte a cebola e o alho, suando até ficarem transparentes.
Junte o caldo, a mandioquinha e o alecrim e cozinhe lentamente por cerca de 30 minutos ou até que esteja bem macia.
Junte o espinafre e cozinhe por mais 10 minutos. Retire os galhos de alecrim.
Bata tudo no liquidificador, acerte o sal e, se necessário, acrescente mais caldo, deixando cremoso.', NULL, NULL, 5, 129, 'jantar', TRUE);

-- 15. Sopa funcional
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('55e4d5d7-4ec8-5379-a06f-af28f77fd37d', 'Sopa funcional', 'Entrada · Caldos e sopas', '["1 cebola pequena picada","1 fio de óleo para refogar","2 tomates sem pele picados","2 talos de alho-poró em rodelas","2 folhas de couve-manteiga","1 punhado de salsinha picada","3 talos de cebolinha picada","8 buquês pequenos de couve-flor","1 beterraba em cubos","1 cenoura em rodelas","1/2 xícara (chá) de ervilha fresca","1 punhado de folhas frescas de hortelã","Sal, pimenta e especiarias (coentro, manjericão, alecrim e açafrão) a gosto","Água suficiente para cobrir os legumes"]', 'Em uma panela, refogue a cebola com o óleo.
Acrescente todos os outros ingredientes e refogue rapidamente.
Junte os temperos e a água; assim que começar a ferver, abaixe o fogo e deixe cozinhar por 30 minutos.
Espere esfriar um pouco e bata no liquidificador.', 'Sirva com 2 colheres (sopa) de farelo de aveia ou 2 colheres (sopa) de arroz integral para acompanhar.', NULL, 6, 87, 'jantar', TRUE);

-- 16. Palitos crocantes de abobrinha
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('18faf37e-d9f6-577a-9096-1fef6b2c64fd', 'Palitos crocantes de abobrinha', 'Entrada · Colorretal', '["2 colheres (sopa) de cereal sem açúcar com fibras moído","1 colher (chá) de queijo parmesão light ralado","2 colheres (sopa) de orégano","1 colher (sopa) de manjericão seco","2 claras","2 abobrinhas cortadas em palitos","Sal e pimenta a gosto"]', 'Em um prato, misture o cereal, o queijo, o orégano, o manjericão, a pimenta e o sal.
Bata as claras até formar uma espuma.
Passe a abobrinha na clara e depois na mistura de cereal.
Preaqueça o forno e espalhe os palitos de abobrinha em uma forma antiaderente.
Leve ao forno por cerca de 10 minutos ou até ficarem crocantes. Sirva em seguida.', NULL, NULL, 2, 113, 'lanche', TRUE);

-- 17. Bechamel enriquecido
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('d7867660-2f9a-5410-928d-d882d7538b25', 'Bechamel enriquecido', 'Entrada · Como enriquecer os alimentos', '["3 talos de couve-flor cozidos","3 colheres (sopa) de margarina","3 colheres (sopa) de farinha de trigo","4 xícaras (chá) de leite integral ou leite enriquecido","Noz-moscada a gosto"]', 'Em uma panela pequena, aqueça o leite e reserve.
Em outra panela, derreta a margarina e acrescente a farinha, mexendo até formar uma massa.
Adicione aos poucos o leite aquecido, sempre mexendo e incorporando à massa.
Ao final, acrescente os talos de couve-flor cozidos e a noz-moscada.
Bata tudo no liquidificador e coe.', 'Este molho pode ser usado como sopa creme e também como base de vários outros molhos, como mostarda, rosé, estrogonofe e outros.', NULL, 4, NULL, NULL, TRUE);

-- 18. Mingau de aveia com banana verde
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('10a279ec-e0a2-5372-bcc5-6115e6aa9c60', 'Mingau de aveia com banana verde', 'Entrada · Como enriquecer os alimentos', '["3 paus de canela (2 para decoração)","4 colheres (sopa) de aveia em flocos","1 colher (sopa) de açúcar","2 xícaras (chá) de leite (pode usar o leite enriquecido)","2 bananas bem verdes","3 colheres de coco ralado (opcional)"]', 'Descasque as bananas, amasse com um garfo e reserve.
Em uma panela, misture todos os ingredientes e leve ao fogo baixo, sempre mexendo.
Continue mexendo até o mingau adquirir a consistência desejada.
Se preferir, polvilhe o coco ralado sobre o mingau e decore com os outros dois paus de canela.', NULL, NULL, 2, NULL, 'cafe', TRUE);

-- 19. Molho de tomate enriquecido com licopeno
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('e7ee7a31-3cce-5827-8673-39e49a8c515c', 'Molho de tomate enriquecido com licopeno', 'Entrada · Como enriquecer os alimentos', '["1 cebola média bem picada","1 cenoura média ralada finamente","1/2 talo de salsão bem picado","1/2 beterraba ralada finamente","1/2 kg de tomate bem vermelho","1 colher (sopa) de azeite","1/2 maço de cheiro-verde"]', 'Corte os tomates no meio, retire as sementes e reserve.
Refogue a cebola com o azeite até ficar transparente.
Acrescente o salsão, a cenoura e a beterraba e refogue em fogo baixo.
Acrescente os tomates sem sementes, tampe a panela e deixe cozinhar até os tomates desmancharem.
Bata no liquidificador ou com um mixer (sem peneirar) e acrescente o cheiro-verde picado.
Leve ao fogo novamente e deixe o molho apurar, quase em ponto de polpa.', 'Pode ser usado em massas, pizzas etc.', NULL, 4, NULL, NULL, TRUE);

-- 20. Sopa de feijão rica
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('076c10e7-5e7a-5ff7-84ad-3c3ecb48bb18', 'Sopa de feijão rica', 'Entrada · Como enriquecer os alimentos', '["1 colher (sopa) de manteiga","1 colher (sopa) de azeite de oliva","1 cebola média picada","2 tomates picados, sem pele nem sementes","1 talo de salsão picado","2 cenouras médias picadas","2 batatas inteiras descascadas","5 folhas de repolho picadas","2 xícaras (chá) de feijão-fava cozido","2 L de caldo de galinha caseiro","1 colher (sopa) de talos de salsa e cebolinha picadinhos","4 colheres (sopa) de queijo parmesão ralado"]', 'Derreta a manteiga e junte o azeite. Acrescente a cebola e o tomate e refogue.
Adicione o salsão, a cenoura, as batatas inteiras, o repolho, o feijão e o caldo de galinha e deixe ferver por 40 minutos.
Retire as batatas, amasse-as e torne a colocá-las na panela.
Antes de servir, acrescente a salsa e a cebolinha, misture bem e polvilhe o queijo parmesão.', NULL, NULL, 10, NULL, 'jantar', TRUE);

-- 21. Bolinhos de abobrinha
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('0c01e8fd-a9a9-59e0-a7bb-4a7066e230d0', 'Bolinhos de abobrinha', 'Entrada · Diabetes', '["2 abobrinhas médias","200 g de ricota amassada","1 ovo","2 colheres (sopa) de salsinha picada","1 pote de iogurte natural desnatado","1 xícara (chá) de farinha de trigo","1 colher (chá) de fermento em pó","2 colheres (chá) de azeite de oliva"]', 'Rale as abobrinhas no ralo grosso e misture o restante dos ingredientes.
Modele bolinhas e coloque-as em uma assadeira untada com azeite.
Asse em forno alto (200 °C) preaquecido por cerca de 20 minutos ou até que fiquem dourados.', NULL, NULL, 20, 79, 'lanche', TRUE);

-- 22. Pão com pó de casca de maracujá e farinha de centeio
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('d7ed4802-139f-597b-abaa-dc3c0ce49ec6', 'Pão com pó de casca de maracujá e farinha de centeio', 'Entrada · Diabetes', '["1 copo de água morna","1 ovo","1 colher (chá) de sal","2 colheres (sopa) de adoçante de uso culinário","2 copos de farinha de trigo especial","3 colheres (sopa) de pó de casca de maracujá","1 copo de farinha de centeio","1/4 de copo de sementes de linhaça","2 1/2 colheres (chá) de fermento biológico seco instantâneo"]', 'Peneire as farinhas e o sal.
Em uma vasilha, misture a farinha de maracujá e as sementes de linhaça. Acrescente o ovo.
Adicione o adoçante e o fermento dissolvido na água morna. Sove a massa até ficar lisa.
Deixe descansar em ambiente aquecido até que aumente de tamanho (60 minutos), coberta com um pano limpo e úmido para não secar.
Após a massa crescer, divida em duas partes, enrole e coloque em formas.
Deixe descansar por mais uma hora e meia, até dobrar de tamanho.
Leve ao forno preaquecido a 150 °C por 50 minutos ou até ficar dourado.', NULL, NULL, 6, 371, 'cafe', TRUE);

-- 23. Salada de frango ao molho de abacate
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('09c657da-73a2-59f3-ae73-e35559dc5dfa', 'Salada de frango ao molho de abacate', 'Entrada · Diabetes', '["Salada: 2 peitos de frango sem pele temperados","Salada: 1 pimentão amarelo pequeno cortado em tiras","Salada: 100 g de rúcula","Salada: 100 g de agrião","Salada: 100 g de tomates-cereja cortados ao meio","Salada: azeite para grelhar","Salada: sal e pimenta a gosto","Molho: 1 colher (sopa) de salsinha picada","Molho: 1 colher (sopa) de azeite","Molho: sal e pimenta a gosto","Molho: 1 abacate picado","Molho: 1 limão (suco)","Molho: 3 colheres (sopa) de creme de leite"]', 'Grelhe o frango com o azeite, corte-o em tiras e reserve.
Em uma tigela, misture o pimentão, as folhas, os tomates e o frango.
Bata todos os ingredientes do molho no liquidificador e despeje sobre a salada.
Sirva a seguir.', NULL, NULL, 2, 162, 'almoco', TRUE);

-- 24. Sopa de músculo com aveia
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('e79e2e01-962d-5223-97b9-130500aa5a25', 'Sopa de músculo com aveia', 'Entrada · Diabetes', '["200 g de músculo bovino picado","1/2 cebola picada","1/2 talo de salsão picado","1 dente de alho picado","500 ml de água","1 batata pequena picada em cubos (aprox. 80 g)","1 cenoura pequena picada em cubos (aprox. 50 g)","1 pedaço pequeno de abóbora japonesa (aprox. 50 g)","1/2 xícara de aveia em grão","120 ml de suplemento nutricional à base de lipídeos sem sabor (emulsão de lipídeos)","Salsinha e sal a gosto"]', 'Em uma panela de pressão, cozinhe o músculo com a água, a cebola, o salsão e o alho.
Quando o músculo estiver cozido, acrescente a batata, a cenoura, a abóbora e o sal. Deixe cozinhar até que os legumes fiquem macios.
Acrescente a aveia e deixe cozinhar por mais 5 minutos, mexendo sempre.
Retire do fogo e acrescente o suplemento nutricional.
Decore com salsinha e sirva a seguir.', NULL, NULL, 2, 313, 'jantar', TRUE);

-- 25. Salada grega
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('922be710-1dfd-5412-a4c5-89a2140d8bd6', 'Salada grega', 'Entrada · Diabetes', '["2 tomates cortados em quatro","1 pepino japonês sem sementes em fatias","2 colheres (sopa) de pimentão verde em cubos","2 colheres (sopa) de cebola roxa em cubos","6 azeitonas sem caroço picadas","2 colheres (sopa) de queijo cottage","Molho: 2 colheres (café) de hortelã","Molho: 2 colheres (café) de salsa","Molho: 2 colheres (café) de vinagre de vinho tinto","Molho: 2 colheres (café) de molho de pimenta vermelha","Molho: 2 colheres (chá) de azeite","Molho: sal a gosto"]', 'Numa vasilha, junte os temperos do molho e emulsione com um batedor de arame.
Monte a salada: cottage no centro, tomates ao redor e pepino num círculo mais externo.
Sobre os tomates, coloque o pimentão e a cebola. Ao redor do cottage, ponha as azeitonas.
Regue o molho sobre a salada, no centro do cottage.', NULL, NULL, NULL, 42, 'almoco', TRUE);

-- 26. Caldo verde especial
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('3443dd57-24e5-585a-882a-a57c1262f54b', 'Caldo verde especial', 'Entrada · Doenças cardiovasculares', '["100 g de batatas inteiras sem casca","100 g de couve-flor","200 g de brócolis","200 g de couve-manteiga cortada em fios","1 cebola","2 pitadas de noz-moscada","2 colheres (sopa) de salsinha picada","1 L de caldo de legumes caseiro","1 talo de salsão","1/2 talo de alho-poró"]', 'Em uma panela, ferva o caldo de legumes e cozinhe nele as batatas, a couve-flor, o brócolis, a cebola, o salsão e o alho-poró.
Quando a batata estiver cozida, bata tudo no liquidificador, volte para a panela e espere abrir fervura novamente.
Tempere com noz-moscada.
À parte, refogue os fios de couve-manteiga com a salsinha e misture no creme. Sirva quente.', NULL, NULL, NULL, NULL, 'jantar', TRUE);

-- 27. Salada tropical com lascas de salmão
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('3c963628-2d20-540a-a543-98bbfc933770', 'Salada tropical com lascas de salmão', 'Entrada · Doenças cardiovasculares', '["100 g de alface americana","100 g de chicória","100 g de alface roxa","100 g de manga em cubos","100 g de salmão","1 colher (sopa) de hortelã","1 iogurte","Brotos variados"]', 'Corte fatias finas do filé de salmão, doure em uma frigideira e reserve.
Rasgue as folhas com as mãos e disponha em uma saladeira. Sobre elas, disponha os cubos de manga.
Faça um molho juntando o iogurte com a hortelã e coloque sobre as folhas.
No final, coloque as lâminas de salmão e decore o centro da saladeira com brotos variados.', NULL, NULL, NULL, NULL, 'almoco', TRUE);

-- 28. Sopa de aspargos
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('6b2c7756-f2c8-56a3-b035-99d337fa9464', 'Sopa de aspargos', 'Entrada · Doenças cardiovasculares', '["300 g de batatas","8 aspargos frescos","1 colher (sopa) de salsinha picada","1 colher (sopa) de hortelã picada","1 L de caldo de legumes","1 fio de azeite","Noz-moscada a gosto"]', 'Cozinhe as batatas no caldo de legumes.
Enquanto isso, corte os aspargos em fatias finas ou anéis.
Em uma frigideira, coloque um fio de azeite e refogue os aspargos com a salsinha e a hortelã. Reserve.
Depois que as batatas estiverem cozidas, bata no liquidificador com o caldo, formando um creme.
Volte ao fogo, adicione os aspargos refogados e tempere com noz-moscada. Sirva quente.', NULL, NULL, NULL, NULL, 'jantar', TRUE);

-- 29. Cesta de tomates com antepasto de berinjelas e abobrinhas
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('6b3a65ff-2b9c-519a-94ec-9bb003d4515c', 'Cesta de tomates com antepasto de berinjelas e abobrinhas', 'Entrada · Fibras', '["4 abobrinhas italianas","4 berinjelas","1 pimentão vermelho","1 pimentão amarelo","6 tomates médios","1 cebola picada","1/2 xícara (chá) de manjericão picado","1/2 xícara (chá) de azeite","4 colheres (sopa) de mostarda dijon (ou escura)","Óleo para fritar","Sal e pimenta a gosto"]', 'Tire uma tampa dos tomates e, com uma colher, retire a polpa formando uma espécie de cesta.
Regue com azeite, tempere com sal e leve ao forno por cerca de 10 minutos. Retire do forno e reserve na geladeira.
Para o antepasto, rale as berinjelas e as abobrinhas ou corte em tiras finas. Corte os pimentões (sem sementes) e a cebola no mesmo tamanho.
Frite tudo em óleo quente até dourar as berinjelas e escorra todo o óleo.
Coloque em um recipiente com tampa, cubra com azeite e o manjericão picado, tempere com sal e pimenta e reserve por 24 horas na geladeira.
No dia seguinte, recheie os tomates com o antepasto, disponha em um prato e decore com a mostarda dijon.', NULL, NULL, 4, 230, 'almoco', TRUE);

-- 30. Muffin integral de cenoura
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('66d840c2-c8f9-5257-9247-a09ab532caaf', 'Muffin integral de cenoura', 'Entrada · Fibras', '["1/2 xícara (chá) de aveia","1/2 xícara (chá) de farinha integral","2 cenouras","1/2 xícara (chá) de farinha de trigo","1/2 xícara (chá) de óleo","1/2 xícara (chá) de açúcar","3 ovos","1 colher (sopa) de fermento"]', 'Bata todos os ingredientes, exceto o fermento, no liquidificador.
Depois, misture o fermento manualmente.
Despeje a massa em forminhas e leve ao forno por 30 minutos a 180 °C.
Sirva frio ou quente.', NULL, NULL, 12, 133, 'lanche', TRUE);

-- 31. Quibe de quinoa ao forno recheado com queijo branco e brócolis
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('55eb660b-3f72-5d1a-9e97-8b4739723e29', 'Quibe de quinoa ao forno recheado com queijo branco e brócolis', 'Entrada · Fibras', '["500 g de carne moída (fraldinha)","1/2 xícara (chá) de quinoa","2 colheres (sopa) de hortelã","1 limão","1 colher (sopa) de azeite","1 xícara (chá) de brócolis","2 tomates","1/2 maço de salsinha","1 cebola","1/2 xícara (chá) de queijo branco","Sal a gosto"]', 'Escorra o sangue da carne moída. Deixe a quinoa de molho por cerca de 2 horas.
Misture a hortelã picada, o suco do limão, a carne moída e a quinoa. Tempere com sal e reserve.
Em uma vasilha, misture a cebola, o queijo branco ralado, os tomates, a salsinha e o brócolis, todos bem picadinhos.
Unte uma travessa com azeite e disponha metade da carne. Sobre ela, coloque o recheio de queijo e cubra com o restante da carne.
Leve ao forno a 180 °C por cerca de 40 minutos. Sirva quente.', NULL, NULL, 10, 201, 'almoco', TRUE);

-- 32. Salada colorida
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('e188f1e1-6e66-5200-92a4-f8b696bb7a45', 'Salada colorida', 'Entrada · Fibras', '["Salada: 1 pimentão amarelo em tiras","Salada: 6 folhas grandes de alface crespa","Salada: 6 folhas grandes de alface roxa","Salada: 6 folhas grandes de alface americana","Salada: 6 tomates-cereja picados","Salada: 2 laranjas em gomos","Salada: 4 colheres (sopa) de castanha-do-pará","Salada: 1 colher (sopa) de semente de linhaça","Molho: 4 colheres (sopa) de azeite","Molho: 1 colher (sopa) de suco de limão","Molho: 1 colher (café) de sal","Molho: pimenta a gosto"]', 'Em um recipiente, acomode o pimentão, as folhas de alface, os tomates e as laranjas. Salpique a castanha-do-pará e a linhaça e reserve.
Misture todos os ingredientes do molho e regue a salada.', NULL, NULL, 4, 180, 'almoco', TRUE);

-- 33. Salada integral
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('012ffebc-15a4-5f81-ac10-4aa5bc4c7ba4', 'Salada integral', 'Entrada · Fibras', '["200 g de macarrão integral","2 colheres (sopa) de uva-passa","1/2 xícara (chá) de castanha-de-caju","300 g de frango cozido","1 cebola","3 colheres (sopa) de salsinha","1 pimentão vermelho","150 g de trigo integral em grão","1/2 xícara (chá) de talos de agrião","Azeite para refogar"]', 'Cozinhe o macarrão integral em água fervente, escorra e leve à geladeira para esfriar.
Em uma panela, cozinhe o trigo por 1 hora e 20 minutos. Escorra e reserve.
Em uma frigideira, aqueça o azeite e refogue a cebola, o pimentão e os talos picados.
Quando começar a dourar, adicione o frango desfiado e refogue por 20 minutos.
Em uma travessa, misture o macarrão, o trigo, o refogado e o restante dos ingredientes picados.
Reserve em recipiente fechado na geladeira por cerca de 2 horas. Sirva frio.', NULL, NULL, 10, 161, 'almoco', TRUE);

-- 34. Antepasto siciliano
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('d78c84ca-71a6-5e0e-a164-9b4b0ed6e4d3', 'Antepasto siciliano', 'Entrada · Hipertensão', '["1 pimentão vermelho","4 berinjelas","2 cebolas","3 dentes de alho","3 pitadas de orégano","1 colher (sopa) de azeite extravirgem","3 pitadas de manjericão","1/2 xícara (chá) de vinho branco seco"]', 'Lave o pimentão, retire as sementes e corte em tirinhas finas. Faça o mesmo com as berinjelas.
Coloque o pimentão e as berinjelas em uma tigela grande.
Corte as cebolas em rodelas fininhas, amasse os dentes de alho e misture na tigela com o orégano, o manjericão e o azeite.
Misture bem e despeje em uma assadeira antiaderente untada com azeite. Regue com o vinho e cubra com papel-alumínio.
Leve ao forno a 180 °C por cerca de 25 a 30 minutos.
Retire do forno e reserve na geladeira.', 'Pode ser servido sobre pães ou saladas.', NULL, 8, 153, 'lanche', TRUE);

-- 35. Salada de endívia com mel
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('7cff82db-8d5f-5748-a3c1-9b0742e33e50', 'Salada de endívia com mel', 'Entrada · Hipertensão', '["1 endívia","150 g de queijo branco","100 g de nozes","2 colheres (sopa) de azeite extravirgem","3 colheres (sopa) de vinagre de maçã","1 colher (café) de mel","1 pitada de pimenta-do-reino","1 copo de iogurte desnatado","1 colher (sopa) de alecrim picado"]', 'Lave a endívia, higienizando-a corretamente. Disponha em uma travessa e reserve.
No centro de cada folha, coloque pedaços do queijo picado.
Misture o azeite, o mel, o vinagre, o alecrim e a pimenta e regue por cima dos cubos de queijo.
Polvilhe as nozes picadinhas.
No final, coloque o iogurte em uma bisnaga e risque sobre as folhas da endívia.', NULL, NULL, 4, 85, 'almoco', TRUE);

-- 36. Barrinha de cereal caseira
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('2b5a9bee-265c-5029-9e3a-2b4fbdecbd1d', 'Barrinha de cereal caseira', 'Entrada · Estômago / Intestino', '["6 colheres (sopa) de granola","4 colheres (sopa) de flocos de arroz, de preferência integral","1 colher (sopa) de achocolatado light","1 colher (sopa) de lecitina de soja","3 colheres (sopa) de iogurte desnatado","1 colher (chá) de adoçante para forno e fogão","1 colher (café) de bicarbonato de sódio","2 ameixas secas picadas"]', 'Em uma tigela, misture a granola, os flocos de arroz e o achocolatado e reserve.
Em outra tigela, misture bem o iogurte, o adoçante, a lecitina de soja e o bicarbonato.
Junte as duas misturas, acrescente as ameixas picadas e misture.
Coloque a massa em uma forma e leve para assar em forno médio por aproximadamente 15 minutos.
Corte as barrinhas e sirva.', NULL, NULL, 15, 87, 'lanche', TRUE);

-- 37. Biscoito de aveia e cacau
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('e6ad92c8-841b-5887-8c36-9cf82df22d4e', 'Biscoito de aveia e cacau', 'Entrada · Estômago / Intestino', '["2 1/2 xícaras (chá) de aveia em flocos finos","7 colheres (sopa) de açúcar demerara","4 colheres (sopa) de margarina","1 colher (sopa) de essência de baunilha","2 colheres (chá) de fermento em pó","2 ovos","4 colheres (sopa) de cacau em pó"]', 'Em uma vasilha, misture a aveia, o fermento, o açúcar e o cacau.
Adicione a margarina, a essência de baunilha e os ovos e misture.
Em uma assadeira, coloque uma folha de papel-manteiga untada e distribua porções de 1 colher (chá) de massa, deixando espaço entre os biscoitos.
Leve ao forno preaquecido em temperatura média por cerca de 15 minutos ou até que fiquem assados.
Retire do forno e deixe esfriar.', NULL, NULL, 60, 33, 'lanche', TRUE);

-- 38. Bolinho de arroz integral
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('406fbae5-ee7b-5cc5-a970-0a5f0b6ef2c8', 'Bolinho de arroz integral', 'Entrada · Estômago / Intestino', '["1 cebola pequena picada","1 dente de alho picado","2 colheres (sopa) de azeite","2 1/2 xícaras (chá) de arroz integral cozido","1 cenoura ralada","1 colher (chá) de gergelim","1 colher (chá) de sal","1 xícara (chá) de farinha de aveia","2 ovos","1 colher (café) de fermento","Sal e salsinha a gosto"]', 'Doure a cebola e o alho no azeite.
Em uma tigela, misture os outros ingredientes e adicione a cebola e o alho.
Com a massa, faça bolinhos.
Unte uma forma com azeite e leve os bolinhos ao forno preaquecido por cerca de 25 minutos.', NULL, NULL, 10, 41, 'lanche', TRUE);

-- 39. Sopa de couve-flor
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('b68ae046-59e8-5fae-a142-740900486553', 'Sopa de couve-flor', 'Entrada · Insuficiência renal e hepática', '["1 colher (sopa) de margarina","2 colheres (sopa) de cebola picada","1 1/2 colher (sopa) de farinha de trigo","1/2 colher (chá) de curry em pó","1 colher (chá) de cúrcuma em pó","2 xícaras (chá) de caldo de legumes","200 g de couve-flor","60 ml de água","2 colheres (sopa) de cebolinha picada","3 colheres (sopa) de suplemento nutricional em pó sabor baunilha"]', 'Em uma panela, derreta a margarina e refogue a cebola.
Acrescente a farinha de trigo, o curry e a cúrcuma, misture bem e adicione o caldo de legumes. Mexa bem até engrossar.
Junte a couve-flor e deixe cozinhar até ficar macia. Desligue o fogo.
Em um recipiente à parte, dilua o suplemento nutricional na água.
Adicione o suplemento diluído à sopa, acrescente a cebolinha e sirva em seguida.', NULL, NULL, 2, 192, 'jantar', TRUE);

-- 40. Sopa fria de beterraba
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('6613a525-8ed9-5085-b36b-129ca01a0fee', 'Sopa fria de beterraba', 'Entrada · Insuficiência renal e hepática', '["1 beterraba média picada","1 colher (sobremesa) de suco de limão","6 colheres (sopa) de suplemento nutricional em pó sem sabor","200 ml de água","100 ml de caldo de legumes","2 colheres (sopa) de iogurte natural desnatado"]', 'Em uma panela, ferva a água e o caldo de legumes, adicione a beterraba e cozinhe até começar a desmanchar. Deixe esfriar.
Bata no liquidificador a beterraba, o iogurte, o suco de limão e o suplemento nutricional.
Sirva gelado.', NULL, NULL, 1, 270, 'jantar', TRUE);

-- 41. Bolo de tomate
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('04d3c9ae-024e-5041-a60b-a89a0acf703e', 'Bolo de tomate', 'Entrada · Licopeno e polifenóis', '["8 a 10 tomates descascados e bem picados","1/2 maço de cheiro-verde","2 ovos batidos (clara e gema separadas)","1/2 copo de azeite","Farinha de trigo até dar o ponto","Sal a gosto","2 colheres (sopa) de queijo ralado","1/2 cebola pequena ralada","1 colher (sopa) de fermento","Manteiga e farinha para untar"]', 'No liquidificador, bata os tomates, os ovos e o azeite.
Acrescente a farinha aos poucos, até dar ponto de massa de bolo.
Adicione os demais ingredientes e misture manualmente.
Unte formas com manteiga e farinha, despeje a massa e asse por 20 a 30 minutos a 170–180 °C.', NULL, NULL, 12, 58, 'lanche', TRUE);

-- 42. Pappardelle de cacau
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('d54eca8e-2b69-5f9b-a59d-9a18453d403d', 'Pappardelle de cacau', 'Entrada · Licopeno e polifenóis', '["Massa: 6 ovos","Massa: 6 colheres (sopa) de chocolate em pó","Massa: 600 g de farinha de trigo","Molho: 1 maço de brócolis cozido al dente","Molho: 1 lata de atum","Molho: azeite e alho a gosto","Queijo ralado para servir"]', 'Massa: misture os ovos, o chocolate e a farinha. Amasse bem e passe na máquina de massas ou abra com o rolo. Corte no formato que preferir e cozinhe.
Molho: frite o alho no azeite, acrescente o brócolis e em seguida o atum.
Deixe alguns minutos e incorpore a massa já cozida e escorrida. Misture muito bem e sirva com queijo ralado.', 'Você pode usar molho de tomate ao sugo misturado com creme de leite.', NULL, 5, 249, 'almoco', TRUE);

-- 43. Biscoitinhos de soja
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('6871c567-e1d9-54b1-a0ea-cbabf7bcb4d1', 'Biscoitinhos de soja', 'Entrada · Mama', '["2 xícaras (chá) de açúcar","5 colheres (sopa) de margarina","3 ovos","1 xícara (chá) de farinha de soja","4 xícaras (chá) de polvilho doce","1 xícara (chá) de fubá"]', 'Junte o açúcar, a margarina e os ovos e mexa bem. Reserve.
À parte, misture a farinha de soja, o polvilho e o fubá.
Junte aos poucos à mistura reservada e amasse até obter uma massa homogênea.
Modele os biscoitinhos em formato de bolinhas e faça uma leve pressão em cada um.
Disponha em uma assadeira untada e asse em forno médio preaquecido até começar a dourar. Desenforme frio.', NULL, NULL, 30, 38, 'lanche', TRUE);

-- 44. Tabule de soja
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('cfbf06b1-4e1f-5b1d-bb4a-68fc2b00fc7d', 'Tabule de soja', 'Entrada · Mama', '["1 xícara (chá) de soja em grãos cozida","1 xícara (chá) de salsinha picada","1/2 xícara (chá) de folhas de hortelã","1/3 de xícara (chá) de cebolinha picada","2 tomates sem sementes picados","1 cebola roxa picada","2 1/2 colheres (sopa) de suco de limão","1/2 xícara (chá) de azeite de oliva","Sal a gosto"]', 'Misture todos os ingredientes e sirva a salada fria.', NULL, NULL, 4, 111, 'almoco', TRUE);

-- 45. Quiche de ricota e rúcula
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('d64b638c-8396-51a5-abab-e7aef0b8c176', 'Quiche de ricota e rúcula', 'Entrada · Preparações sem glúten', '["Massa: 2 xícaras (chá) de creme ou farinha de arroz","Massa: 1 xícara (chá) de fécula de batata","Massa: 1/2 xícara (chá) de polvilho doce","Massa: 1 colher (sopa) de água","Massa: manteiga ou margarina até dar o ponto","Massa: sal a gosto","Recheio: 200 g de ricota amassada","Recheio: raspas de 2 limões-sicilianos","Recheio: 1/2 maço de rúcula picada","Recheio: 150 ml de creme de leite fresco ou creme de leite de soja","Recheio: sal, pimenta e noz-moscada a gosto"]', 'Misture todos os ingredientes da massa até formar uma bola compacta. Forre o fundo de uma assadeira e reserve.
Misture todos os ingredientes do recheio e coloque sobre a massa.
Leve ao forno preaquecido a 180 °C por aproximadamente 35 minutos ou até que a superfície fique dourada.', NULL, NULL, NULL, NULL, 'lanche', TRUE);

-- 46. Tabule de quinoa
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('1ff2e482-059d-5325-82ed-1821e5c89bee', 'Tabule de quinoa', 'Entrada · Preparações sem glúten', '["1 xícara (chá) de quinoa em grão","2 xícaras (chá) de água","1 tomate médio em cubinhos","1/2 pepino em cubinhos","1 cebola média picada","1 dente de alho grande picado","3 colheres (sopa) de salsinha picada","2 colheres (sopa) de hortelã picada","1/2 limão (suco)","2 colheres (sopa) de azeite de oliva extravirgem","1 colher (chá) de sal marinho"]', 'Cozinhe a quinoa na água por 25 minutos, com a panela parcialmente tampada, até a água secar.
Transfira a quinoa para uma tigela e deixe esfriar.
Misture todos os outros ingredientes à quinoa, mexa bem e leve à geladeira.', NULL, NULL, NULL, NULL, 'almoco', TRUE);

-- 47. Tomates assados ao pesto de manjericão
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('b258ef8a-d102-5761-b9f1-d0a69dbea424', 'Tomates assados ao pesto de manjericão', 'Entrada · Próstata', '["4 tomates cortados em rodelas","1 colher (sopa) de orégano","5 colheres (sopa) de manjericão picado","5 colheres (sopa) de azeite","2 dentes de alho picados","100 g de queijo parmesão ralado","100 g de cream cheese","Sal e pimenta a gosto"]', 'Coloque as rodelas de tomate em uma assadeira, polvilhe sal, pimenta e orégano e asse em forno preaquecido a 180 °C por cerca de 10 minutos.
Bata no liquidificador o manjericão, o azeite, o alho, o parmesão, o sal e a pimenta. Reserve.
Retire os tomates do forno, coloque o equivalente a 1 colher (café) de cream cheese sobre cada rodela e volte ao forno por mais 2 minutos.
Regue com o molho pesto e sirva ainda quente.', NULL, NULL, 4, 273, 'almoco', TRUE);

-- 48. Croquete de soja
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('91df3dc8-b6f4-5e84-b939-6c4fff6e9fb9', 'Croquete de soja', 'Entrada · Próstata / Mama', '["1 xícara (chá) de proteína texturizada de soja","500 ml de água quente","1/4 de xícara (chá) de farinha de milho","1 cenoura ralada","1 pimentão vermelho picado","2 colheres (sopa) de salsinha","1 dente de alho picado","1 cebola picada","1 colher (café) de orégano","2 colheres (sopa) de castanha-de-caju moída","2 colheres (sopa) de azeite","Óleo para untar","Sal a gosto"]', 'Hidrate a proteína de soja com a água quente por 15 minutos. Escorra e tire o excesso de água.
Adicione o restante dos ingredientes e misture bem até formar uma massa homogênea.
Faça bolinhos, coloque em uma assadeira untada e asse em temperatura média por cerca de 40 minutos.', NULL, NULL, 8, 114, 'lanche', TRUE);

-- 49. Salada colorida de soja
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('8848a960-da31-56a4-9e29-abd067296937', 'Salada colorida de soja', 'Entrada · Pulmão', '["300 g de soja em grão cozida","2 colheres (sopa) de azeite","1 cebola roxa picada","2 dentes de alho picados","1 pimentão vermelho em cubos","1 pimentão amarelo em cubos","1 cenoura picada","2 ovos cozidos picados","500 g de farinha de milho em flocos","Salsinha e cebolinha a gosto","Sal a gosto"]', 'Refogue o alho, a cebola, os pimentões e a cenoura no azeite.
Acrescente os ovos cozidos, a soja, a cebolinha e a salsinha.
Junte a farinha de milho em flocos e o sal e misture bem.
Deixe esfriar e sirva a seguir.', NULL, NULL, 6, 193, 'almoco', TRUE);

-- 50. Sopa creme de cenoura com gengibre
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('ab5f3bb3-5173-5e4f-aae4-682fc422b203', 'Sopa creme de cenoura com gengibre', 'Entrada · Pulmão', '["1 cebola picada","1 dente de alho picado","1/2 colher (sopa) de óleo","3 copos de água","4 colheres (sopa) de cenoura cozida","1 pedaço pequeno de gengibre","2 colheres (sopa) de extrato de soja","1 colher (sopa) de amido de milho","2 filés de frango cozidos e desfiados","Sal a gosto"]', 'Refogue a cebola e o alho no óleo.
No liquidificador, bata dois copos de água com a cenoura cozida.
Acrescente esse creme à panela, junte o gengibre e deixe ferver.
Dissolva o extrato de soja no restante da água, acrescente o amido de milho e dissolva bem.
Incorpore ao creme de cenoura, mexendo sempre até engrossar. Adicione o sal.
Salpique o frango desfiado e sirva a seguir.', NULL, NULL, 4, 152, 'jantar', TRUE);

-- 51. Creme de abóbora com gengibre
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('524aed8d-080d-5967-8094-f36b03d1d049', 'Creme de abóbora com gengibre', 'Entrada · Quimioterapia e radioterapia', '["1 L de água","1 kg de abóbora japonesa sem casca picada","1 gengibre pequeno picado (60 g)","1 colher (sopa) de óleo","1 dente de alho picado","1 cebola média picada","2 colheres (sopa) de requeijão","Sal e cheiro-verde a gosto"]', 'Cozinhe a abóbora na água com o gengibre e o sal por 20 minutos. Bata no liquidificador.
Em uma panela, refogue o alho e a cebola no óleo, acrescente o creme de abóbora e cozinhe por mais 15 minutos.
Acrescente o requeijão e deixe apurar por 10 minutos.
Sirva com cheiro-verde picado.', 'Indicações: náuseas e vômitos, boca seca, dor para engolir e alteração no paladar.', NULL, 8, 217, 'jantar', TRUE);

-- 52. Sopa creme de mandioquinha
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('97fb0cb8-8cdf-5d6b-b061-9435c2daff4b', 'Sopa creme de mandioquinha', 'Entrada · Receitas hipercalóricas', '["3 mandioquinhas médias","1 colher (sobremesa) de óleo","1/2 cebola média picada","1 dente de alho picado","2 colheres (sopa) de creme de leite","60 ml de suplemento nutricional à base de lipídeos sem sabor (emulsão de lipídeos)","Sal a gosto"]', 'Cozinhe a mandioquinha até que fique macia, amasse com um garfo e reserve.
Em uma panela, refogue a cebola e o alho no óleo.
Acrescente a mandioquinha, o creme de leite e o sal e misture bem.
Retire do fogo, acrescente o suplemento e misture. Sirva a seguir.', NULL, NULL, 2, 305, 'jantar', TRUE);

-- 53. Sopa de mandioca
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('f948c0a1-5090-5105-8982-e5e0089b091a', 'Sopa de mandioca', 'Entrada · Receitas obstipantes', '["200 g de mandioca cozida","1 colher (sobremesa) de margarina","1 colher (sopa) de cebola picada","1/2 colher (café) de salsinha picada","1/2 colher (café) de cebolinha picada","6 colheres (sopa) de suplemento nutricional em pó sem sabor","Sal a gosto"]', 'Cozinhe a mandioca até que fique macia.
Acrescente 1/2 colher (sobremesa) de margarina e a cebola, cozinhe por mais 5 minutos e bata no liquidificador.
Coloque na panela novamente, acrescente a margarina restante e deixe cozinhar em fogo baixo, sem tampa, até ficar cremosa.
Desligue o fogo e acrescente a salsinha, a cebolinha e o suplemento nutricional. Sirva a seguir.', NULL, NULL, 1, 558, 'jantar', TRUE);

-- 54. Biscoitinhos casadinhos de soja
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('b1f12d5c-fa6c-59dc-ab56-836fee4a9849', 'Biscoitinhos casadinhos de soja', 'Entrada · Receitas saborosas com soja', '["3 xícaras (chá) de farinha de trigo","1 1/2 xícara (chá) de farinha de soja","250 g de margarina","1 1/2 copo de leite de soja","1 xícara (café) de açúcar","Mel ou geleia de frutas para rechear"]', 'Prepare um creme com a margarina e o açúcar.
Misture as farinhas e o leite de soja até formar uma massa.
Abra a massa com o auxílio de um rolo e corte em rodelas.
Disponha em assadeiras sem untar e leve ao forno em temperatura média. Retire os biscoitos ainda bem clarinhos.
Espere esfriar, passe mel ou geleia nas rodelas e una uma à outra.', NULL, NULL, 4, 223, 'lanche', TRUE);

-- 55. Pão de orégano
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('6ed82e4b-dd3f-5995-a608-7539805aed5c', 'Pão de orégano', 'Entrada · Refeições mais saborosas', '["1 copo de leite","1 tablete de fermento para pão","3 xícaras (chá) de farinha de trigo","1 colher (sobremesa) de sal","1 colher (sopa) de orégano","3 colheres (sopa) de óleo","1 gema"]', 'Aqueça 1/2 copo de leite e dissolva o fermento. Acrescente 1 xícara de farinha de trigo, misture bem e deixe descansar por 30 minutos ou até crescer.
Junte os ingredientes restantes (menos a gema) e sove muito bem.
Deixe crescer por mais 30 minutos ou até dobrar de tamanho.
Modele o pão e coloque em assadeira untada e enfarinhada.
Pincele com a gema e asse em forno médio por 30 minutos ou até que esteja dourado.', NULL, NULL, NULL, NULL, 'cafe', TRUE);

-- 56. Patê de ricota e ervas
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('c052b8ed-000b-52d2-b289-8ff8202a1eef', 'Patê de ricota e ervas', 'Entrada · Refeições mais saborosas', '["1 ricota fresca","1 caixa de creme de leite light","1 cebola média","1 dente de alho","100 ml de leite desnatado","Cheiro-verde e sal a gosto"]', 'No liquidificador, bata todos os ingredientes, exceto o cheiro-verde.
Misture o cheiro-verde delicadamente.
Sirva com torradas.', NULL, NULL, 20, 57, 'lanche', TRUE);

-- 57. Penne ao basílico (manjericão)
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('5ff918ef-154c-5438-b5c6-bae0b7c888c0', 'Penne ao basílico (manjericão)', 'Entrada · Refeições mais saborosas', '["500 g de macarrão tipo penne","1 colher (chá) rasa de sal para a água de cozimento","3 tomates vermelhos picados, sem pele e sem sementes","1 fio de azeite","1/2 colher (chá) de sal","1 copo de requeijão light","Folhas de manjericão para decorar"]', 'Aqueça 5 litros de água. Acrescente o sal, o azeite e o macarrão e cozinhe até ficar al dente. Escorra e reserve.
Molho: misture bem o tomate, o sal e o requeijão e leve ao fogo para aquecer.
Misture o molho ao macarrão, decore com manjericão e sirva em seguida.', NULL, NULL, 4, 560, 'almoco', TRUE);

-- 58. Salada frescal oriental
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('ff9c76c7-985d-55c8-8823-c78a9575a055', 'Salada frescal oriental', 'Entrada · Refeições mais saborosas', '["Salada: 1 pepino japonês em tiras","Salada: 1 pacote de kani kama em tiras","Salada: 1 pacote de broto de feijão aferventado","Salada: 2 xícaras (chá) de acelga em tiras","Salada: 1/2 pimentão vermelho em tiras","Salada: 1/2 pimentão verde em tiras","Molho: 2 colheres (sopa) de shoyu light","Molho: 2 colheres (sopa) de água","Molho: 3 colheres (sopa) de suco de limão","Molho: 3 colheres (sopa) de cebolinha picada","Molho: 1 colher (sobremesa) de gengibre ralado"]', 'Misture todos os ingredientes da salada e arrume em uma saladeira. Deixe na geladeira por 15 minutos.
Misture todos os ingredientes do molho e despeje sobre a salada.
Sirva em seguida.', NULL, NULL, 4, 86, 'almoco', TRUE);

-- 59. Sopa de agrião com lascas de queijo minas light
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('e669b1a4-8e21-5487-9d3b-558d209c1940', 'Sopa de agrião com lascas de queijo minas light', 'Entrada · Refeições mais saborosas', '["300 g de músculo sem gordura em cubos pequenos","1 colher (chá) rasa de sal","1 colher (sobremesa) de azeite de oliva","1 cenoura picada","1 talo de salsão","2 batatas picadas","1 maço de agrião","2 fatias finas de queijo minas padrão light","1 1/2 L de água filtrada"]', 'Em uma panela de pressão, coloque a água, a carne, a cenoura, as batatas, o salsão e o sal. Cozinhe até a carne ficar macia.
Retire a carne e bata no liquidificador a cenoura, o salsão e as batatas com o caldo.
Devolva à panela com a carne e acrescente o agrião.
Sirva a sopa com os pedaços de carne, lascas bem finas de queijo minas light e um fio generoso de azeite.', NULL, NULL, 6, 129, 'jantar', TRUE);

-- 60. Barcas de endívia recheadas com tabule integral e molho de mostarda
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('c8d05770-b579-570b-ac94-c5f959a1fe42', 'Barcas de endívia recheadas com tabule integral e molho de mostarda', 'Entrada · Saladas apetitosas', '["1 endívia","Tabule: 2 xícaras (chá) de trigo integral em grãos","Tabule: 2 pepinos japoneses","Tabule: 2 tomates para salada","Tabule: 1 cebola","Tabule: 2 colheres (sopa) de hortelã","Tabule: 1 limão (só o suco)","Tabule: 3 colheres (sopa) de azeite","Tabule: sal a gosto","Molho: 1 xícara (chá) de iogurte natural","Molho: 3 colheres (sopa) de mostarda","Molho: 5 grãos de pimenta-rosa"]', 'Para o tabule, cozinhe o trigo em grãos na água por cerca de 30 minutos e reserve na geladeira.
Corte os pepinos, os tomates e a cebola em cubos pequenos e misture ao trigo já frio, com a hortelã, o suco de limão, o azeite e o sal. Reserve refrigerado.
Para o molho, misture todos os ingredientes e reserve refrigerado.
Para a montagem, distribua as folhas de endívia em um prato e coloque o tabule dentro de cada uma.
Risque o molho de mostarda sobre as barcas para decorar.', NULL, NULL, 6, 262, 'almoco', TRUE);

-- 61. Mix de folhas com molho chimichurri e crótons
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('dd83f050-f59e-56ff-9061-0638336a0352', 'Mix de folhas com molho chimichurri e crótons', 'Entrada · Saladas apetitosas', '["Salada: 1/2 alface americana","Salada: 1/2 alface roxa","Salada: 1/2 maço de rúcula","Salada: 1/2 maço de agrião","Salada: 1 tomate italiano","Salada: 2 fatias de pão de forma","Salada: orégano e azeite para os crótons","Molho: 10 g de alho e cebola desidratados","Molho: 10 g de salsinha desidratada","Molho: 10 g de pimentão vermelho","Molho: 10 g de orégano desidratado","Molho: 10 g de louro","Molho: 10 g de cebolinha desidratada","Molho: 10 g de pimenta calabresa e outras pimentas a gosto","Molho: 300 ml de vinagre de vinho branco","Molho: 600 ml de azeite de oliva"]', 'Para o molho, corte o pimentão em cubos pequenos e asse para desidratá-lo.
Misture todos os ingredientes do molho em uma vasilha, cubra com filme plástico e leve à geladeira; o molho fica mais saboroso se descansar por 3 dias.
Corte o tomate italiano em 4 gomos e reserve.
Faça crótons com o pão de forma, cortando em cubos e levando ao forno com orégano e azeite.
Corte as folhas em tiras grossas e disponha no centro do prato; ao redor, coloque os gomos de tomate e os crótons.
Despeje o molho chimichurri por cima de tudo.', NULL, NULL, 4, 335, 'almoco', TRUE);

-- 62. Salada caprese assada com pesto de azeitonas pretas
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('04273df1-2108-55be-ab32-0ec10be121eb', 'Salada caprese assada com pesto de azeitonas pretas', 'Entrada · Saladas apetitosas', '["Salada: 1/2 maço de rúcula","Salada: 8 folhas de manjericão","Salada: 4 dentes de alho","Salada: 300 g de queijo branco (ou muçarela de búfala)","Salada: 2 tomates caqui ou italianos bem vermelhos","Molho: 100 g de azeitonas pretas sem caroço","Molho: 1/2 maço de manjericão","Molho: 4 colheres (sopa) de castanhas picadas","Molho: 8 colheres (sopa) de queijo parmesão ralado","Molho: 2 dentes de alho assados","Molho: azeite"]', 'Corte cada tomate em 4 fatias. Entre as fatias, coloque meio dente de alho e um fio de azeite e leve ao forno alto por aproximadamente 15 minutos.
Enquanto isso, faça o pesto batendo no liquidificador o manjericão, as azeitonas, o alho e o azeite. Acrescente as castanhas e o queijo ralado, bata rapidamente e reserve.
Corte o queijo no tamanho das fatias de tomate.
Para a montagem, disponha a rúcula no centro do prato, coloque uma fatia de tomate e, sobre ela, uma fatia de queijo e uma folha de manjericão. Faça mais uma camada do mesmo jeito.
Finalize com o pesto de azeitonas pretas sobre o queijo.', NULL, NULL, 4, 465, 'almoco', TRUE);

-- 63. Salada de acelga com shimeji refogado e molho ponzu
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('61ce75b2-e641-545d-a62e-017de2042c84', 'Salada de acelga com shimeji refogado e molho ponzu', 'Entrada · Saladas apetitosas', '["Salada: 300 g de acelga","Salada: 100 g de shimeji","Salada: 100 g de brotos de feijão","Salada: 2 colheres (sopa) de shoyu","Salada: 1 colher (sopa) de manteiga","Molho: 1 colher (sopa) de suco de laranja","Molho: 1 colher (sopa) de suco de limão","Molho: 1 colher (sopa) de shoyu"]', 'Corte a acelga em tiras finas e reserve.
Em uma frigideira, refogue o shimeji na manteiga; ao final, coloque o shoyu e deixe refogar.
Para o molho, misture os ingredientes, cozinhe em uma panela por cerca de 5 minutos e reserve na geladeira.
Para montar, coloque a acelga no centro do prato, regue com o molho ponzu e, por cima, coloque o shimeji e os brotos de feijão.', NULL, NULL, 4, 135, 'almoco', TRUE);

-- 64. Salada de alface com tomates-cereja e chutney de manga
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('8d3c0059-575d-5604-a8ed-4f1d5c3d9c8e', 'Salada de alface com tomates-cereja e chutney de manga', 'Entrada · Saladas apetitosas', '["Salada: 1/2 alface americana","Salada: 1/2 alface roxa","Salada: 1/2 alface crespa","Salada: 5 tomates-cereja","Chutney: 1 manga madura em pedaços","Chutney: 1 xícara (chá) de açúcar","Chutney: 1 xícara (chá) de vinagre","Chutney: 1 pimenta dedo-de-moça","Chutney: 1/2 colher (sopa) de gengibre picado","Chutney: sal a gosto"]', 'Separe as folhas dos 3 tipos de alface, corte-as em 3 partes, misture e reserve.
Para o chutney, leve o vinagre e o açúcar ao fogo até o açúcar dissolver por completo.
Quando a calda começar a ferver, adicione a manga e cozinhe até os pedaços começarem a desmanchar (cerca de 10 minutos).
Adicione o restante dos ingredientes e cozinhe por mais 15 minutos, até ponto de doce de colher. Leve à geladeira até resfriar por completo.
Em um prato, disponha as folhas no centro, corte os tomates em 4 e distribua sobre as folhas.
Com uma colher, decore a salada com o chutney de manga.', NULL, NULL, 4, 165, 'almoco', TRUE);

-- 65. Salada de fios de vegetais com palmito, tomates secos e sementes de erva-doce
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('861c2328-0555-56ac-b4fb-b4d98b86a224', 'Salada de fios de vegetais com palmito, tomates secos e sementes de erva-doce', 'Entrada · Saladas apetitosas', '["2 cenouras descascadas","2 talos de alho-poró","2 pepinos japoneses","2 colheres (sopa) de sementes de erva-doce","4 tomates secos","3 colheres (sopa) de azeite","6 unidades de palmito","Sal a gosto"]', 'Corte os palmitos em rodelas transversais (chanfradas) e reserve.
Passe as cenouras e os pepinos no ralo grosso e reserve.
Corte os talos de alho-poró ao meio e depois em fatias finas no sentido do comprimento, formando tiras.
Em uma tigela, junte o azeite, o sal, as sementes de erva-doce e os legumes e misture bem.
Para a montagem, disponha as rodelas de palmito em círculos, formando uma cama redonda. No centro, coloque os vegetais e os tomates secos.', NULL, NULL, 4, 253, 'almoco', TRUE);

-- 66. Salada de folhas azedas com lâminas de alcachofra e molho de hortelã
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('042d62af-1058-5bb0-b289-278a620089fc', 'Salada de folhas azedas com lâminas de alcachofra e molho de hortelã', 'Entrada · Saladas apetitosas', '["Salada: 300 g de acelga","Salada: 1 radicchio","Salada: 300 g de agrião","Salada: 1 alcachofra","Salada: 1/4 de maço de hortelã","Salada: 10 ml de azeite","Molho: 1/2 xícara (chá) de hortelã","Molho: 1/2 xícara (chá) de iogurte natural","Molho: 2 colheres (sopa) de suco de limão","Molho: sal a gosto"]', 'Rasgue as folhas de agrião e acelga com as mãos. Retire 3 folhas do radicchio para fazer uma cestinha natural e rasgue o resto. Misture as folhas rasgadas e reserve.
Faça o molho batendo todos os ingredientes no liquidificador e reserve refrigerado.
Corte a hortelã da salada em tiras finas e reserve.
Limpe a alcachofra, cortando o talo e tirando as folhas (cuidado com os espinhos internos). Com um mandolim ou laminador, corte em lâminas.
Em uma frigideira, doure as lâminas de alcachofra no azeite e, ao final, acrescente a hortelã picada.
Para a montagem, faça a cestinha com as folhas de radicchio, coloque dentro as folhas rasgadas, as lâminas de alcachofra e regue com o molho de hortelã.', NULL, NULL, 4, 494, 'almoco', TRUE);

-- 67. Salada mexicana
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('7c87a2a6-d770-52dd-a91b-f718955afa3d', 'Salada mexicana', 'Entrada · Saladas apetitosas', '["Salada: 1 alface","Salada: 1/2 pacote pequeno de tortilhas de milho (nachos)","Salada: 1 peito de frango","Salada: azeite e sal a gosto","Guacamole: 1 abacate maduro","Guacamole: 3 tomates sem sementes em cubos","Guacamole: 1 colher (sopa) de coentro picado","Guacamole: 1 cebola roxa em cubos","Guacamole: 1 pimenta dedo-de-moça","Guacamole: 1 limão (só o suco)","Guacamole: sal a gosto"]', 'Para o guacamole, corte a pimenta ao meio, retire as sementes, corte em rodelas finas e reserve.
Retire a polpa do abacate e amasse com um garfo. Misture com os tomates e a cebola.
Adicione o suco de limão, o sal, o coentro e a pimenta. Misture bem e leve à geladeira.
Refogue o peito de frango no azeite, desfie e leve à geladeira.
Corte as folhas de alface em tiras finas, tempere com azeite e sal e disponha como um ninho no centro do prato.
Coloque o frango desfiado e o guacamole, distribua alguns nachos e sirva frio.', NULL, NULL, 4, 330, 'almoco', TRUE);

-- 68. Tabule de quinoa com frutas
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('11dc62ac-9b1c-53f7-b39d-5e0b2bcb98bd', 'Tabule de quinoa com frutas', 'Entrada · Saladas apetitosas', '["2 xícaras (chá) de quinoa cozida e fria","1/2 manga","1 kiwi","4 morangos","1 xícara (chá) de hortelã","1 limão (só o suco)"]', 'Corte as frutas em cubos pequenos, pique a hortelã grosseiramente e reserve.
Misture a quinoa já cozida (siga as instruções da embalagem) com a hortelã e as frutas. Leve à geladeira.
Na hora de servir, tempere com o suco de limão.', NULL, NULL, 4, 411, 'almoco', TRUE);

-- 69. Tartare de legumes com molho azedo
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('296c13af-1d4a-59b4-b254-d3963c71dac3', 'Tartare de legumes com molho azedo', 'Entrada · Saladas apetitosas', '["Salada: 3 cenouras","Salada: 2 talos de salsão","Salada: 1 abobrinha italiana","Salada: 1/2 alface americana","Salada: 50 ml de azeite","Salada: 2 colheres (sopa) de salsinha picada","Molho: 1/2 xícara (chá) de creme de leite fresco","Molho: 1/2 limão (só o suco)","Molho: 1 colher (sopa) de azeite","Molho: pimenta-do-reino moída e sal a gosto","Cebolete para decorar"]', 'Corte a cenoura, o salsão e a abobrinha em cubos bem pequenos (brunoise), acrescente o azeite e a salsinha, misture e reserve.
Para o molho, coloque o creme de leite em um recipiente, acrescente o azeite, o sal, a pimenta e, por último, o suco de limão. Mexa até formar um creme e reserve.
Para a montagem, faça uma cesta com folhas de alface americana no centro do prato.
Sobre as folhas, coloque um aro, preencha com os legumes picados e retire o aro.
Despeje o molho azedo sobre os legumes e decore com cebolete.', NULL, NULL, 4, 102, 'almoco', TRUE);

-- 70. Salada colorida com salmão e molho de maracujá
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('59aadb62-7637-53f6-b581-9f36badc9fe8', 'Salada colorida com salmão e molho de maracujá', 'Entrada · Tumores abdominais', '["Salada: 12 ramos de rúcula","Salada: 5 folhas de alface americana","Salada: 5 folhas de alface roxa","Salada: 1 beterraba crua ralada","Salada: 1 batata cozida em rodelas","Salada: 200 g de salmão grelhado","Molho: 1 copo de iogurte desnatado","Molho: 200 ml de suco de maracujá","Molho: 4 colheres (chá) de mel","Molho: sal a gosto"]', 'Em um recipiente, distribua as verduras, os legumes e o salmão. Reserve.
Para o molho de maracujá, misture todos os ingredientes.
Tempere a salada com o molho.', NULL, NULL, 2, 192, 'almoco', TRUE);

-- 71. Salpicão de vegetais com molho de iogurte
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('f94c3b06-803b-5c52-98ea-0884f8a8f55f', 'Salpicão de vegetais com molho de iogurte', 'Entrada · Tumores abdominais', '["Salpicão: 1 xícara (chá) de proteína de soja","Salpicão: água morna para hidratar a proteína","Salpicão: 1 limão (suco)","Salpicão: sal a gosto","Salpicão: 2 colheres (sopa) de azeite","Salpicão: 2 cebolas em cubos","Salpicão: 1 colher (café) de açafrão","Salpicão: 1 cenoura média ralada","Salpicão: 5 folhas de repolho roxo em tiras","Salpicão: 1 pimentão amarelo em cubos","Salpicão: 1 talo de salsão em rodelas","Salpicão: 1 maçã com casca em cubos","Salpicão: 1 xícara (chá) de cheiro-verde picado","Molho: 1 pote de iogurte natural desnatado","Molho: 1 limão (suco)","Molho: 1 colher (sopa) de orégano","Molho: 3 colheres (sopa) de azeite","Molho: 1 dente de alho picado","Molho: sal a gosto"]', 'Hidrate a proteína de soja com água morna, o suco de limão e sal por 20 minutos. Esprema a proteína para retirar todo o líquido.
Em uma panela, coloque o azeite e doure a cebola e a proteína de soja. Acrescente o sal e o açafrão.
Deixe esfriar e acrescente a cenoura, o repolho, o pimentão, o salsão, a maçã e o cheiro-verde. Reserve.
Para o molho de iogurte, misture todos os ingredientes.
Misture o molho ao salpicão e sirva a seguir.', NULL, NULL, 4, 179, 'almoco', TRUE);

-- 72. Filé de peixe com crosta de linhaça e aveia
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('c6ef3613-f9f2-5098-ae28-bfff289e1493', 'Filé de peixe com crosta de linhaça e aveia', 'Prato principal · Alimentos funcionais', '["4 filés de peixe","1 limão (suco)","1 colher (sobremesa) de orégano","2 xícaras (chá) de farinha de linhaça dourada","2 xícaras (chá) de aveia em flocos finos","1 pote de iogurte desnatado","Azeite para untar","Sal e pimenta a gosto"]', 'Tempere os filés de peixe com limão, sal e pimenta e deixe marinar.
Misture o iogurte com o orégano.
Passe os filés na mistura de iogurte e depois na mistura de farinha de linhaça com aveia.
Forre um refratário com papel-alumínio e unte com azeite.
Asse os filés por 20 minutos ou até que fiquem dourados.', NULL, NULL, 4, 186, 'almoco', TRUE);

-- 73. Risoto de quinoa
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('918601b7-d377-503b-bdbd-b4894b373e3d', 'Risoto de quinoa', 'Prato principal · Alimentos funcionais', '["2 colheres (sopa) de azeite","1 cebola picada","2 dentes de alho picados","1 xícara (chá) de quinoa","1 cenoura ralada","1 abobrinha ralada","1 xícara (chá) de queijo branco picado","4 xícaras (chá) de água quente","Salsinha a gosto","Sal a gosto"]', 'Em uma panela, doure a cebola e o alho no azeite.
Adicione a quinoa, a cenoura e a abobrinha e refogue.
Adicione a água quente e o sal e deixe cozinhar por aproximadamente 20 minutos ou até secar a água.
Acrescente a salsinha e o queijo branco. Sirva a seguir.', NULL, NULL, 4, 211, 'almoco', TRUE);

-- 74. Medalhão de filé-mignon ao pesto de rúcula
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('95e77f8c-bcf4-5a8a-8276-551484f458e8', 'Medalhão de filé-mignon ao pesto de rúcula', 'Prato principal · Anemia', '["4 medalhões de filé-mignon","150 g de rúcula","2 colheres (sopa) de azeite","50 g de nozes picadas","Sal a gosto"]', 'Tempere os medalhões a gosto, grelhe e reserve.
No liquidificador, bata a rúcula, o azeite, as nozes e o sal até formar uma pasta.
Disponha os medalhões em um prato e coloque o pesto de rúcula por cima. Sirva a seguir.', NULL, NULL, 4, 146, 'almoco', TRUE);

-- 75. Bolo de casca de banana
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('1e516f80-2147-5e49-a5a8-71862361cb13', 'Bolo de casca de banana', 'Prato principal · Aproveitamento integral dos alimentos', '["Massa: cascas de 4 bananas","Massa: 2 ovos (claras e gemas separadas)","Massa: 2 xícaras (chá) de leite","Massa: 2 colheres (sopa) de margarina","Massa: 3 xícaras (chá) de açúcar","Massa: 3 xícaras (chá) de farinha de trigo","Massa: 1 colher (sopa) de fermento em pó","Cobertura: 1/2 xícara (chá) de açúcar","Cobertura: 1 1/2 xícara (chá) de água","Cobertura: 4 bananas","Cobertura: 1/2 limão","Cobertura: canela em pau e em pó para decorar"]', 'Lave e higienize as cascas das bananas em solução de hipoclorito de sódio, seguindo as instruções da embalagem.
Bata as claras em neve e reserve na geladeira.
Bata no liquidificador as gemas, o leite, a margarina, o açúcar e as cascas de banana.
Despeje em uma vasilha, acrescente a farinha de trigo e mexa bem. Por último, adicione delicadamente as claras em neve e o fermento.
Despeje em uma assadeira untada com margarina e farinha e asse em forno médio (180 °C) preaquecido por aproximadamente 40 minutos.
Cobertura: queime o açúcar em uma panela e junte a água, fazendo um caramelo. Acrescente as bananas em rodelas e o suco de limão e cozinhe por cerca de 20 minutos.
Cubra o bolo ainda quente e decore com canela.', NULL, NULL, 20, 245, 'lanche', TRUE);

-- 76. Cheeseburger saudável (hambúrguer de ramas de beterraba)
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('2f02462b-6dd3-5876-a44f-5d2459bda678', 'Cheeseburger saudável (hambúrguer de ramas de beterraba)', 'Prato principal · Aproveitamento integral dos alimentos', '["1/2 maço de folhas (ramas) de beterraba","2 ovos","2 colheres (sopa) de óleo de soja","1/2 xícara (chá) de leite","6 colheres (sopa) de farinha de trigo","1 colher (sopa) de salsinha picada","1 colher (café) de fermento em pó","1/2 cebola picada","2 dentes de alho bem picados","1 colher (chá) de sal","6 fatias de queijo prato","6 pães de hambúrguer","1 folha de alface","2 rodelas de tomate","Maionese, ketchup e mostarda a gosto"]', 'Lave bem a alface, o tomate e as ramas de beterraba e deixe em solução de hipoclorito de sódio, seguindo as instruções da embalagem. Enxágue em água potável e reserve a alface e o tomate.
Pique bem fininho as ramas de beterraba e misture em uma tigela com todos os demais ingredientes da massa.
Unte com pouco óleo uma frigideira antiaderente, aqueça e frite a massa às colheradas, achatando no formato de hambúrguer. Vire para fritar do outro lado.
Monte o sanduíche colocando o queijo sobre o hambúrguer ainda quente para derreter.
Acrescente a alface e as rodelas de tomate.', 'Triture a massa no liquidificador e acrescente 1 colher (sobremesa) de caldo de carne em pó para acentuar o sabor.', NULL, 6, 228, 'lanche', TRUE);

-- 77. Creme verde
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('b99ab3fd-e597-5df5-9e57-c0cd7d86d259', 'Creme verde', 'Prato principal · Cabeça e pescoço', '["300 g de brócolis picado","300 g de couve-flor picada","1 xícara (chá) de batata ralada","1 xícara (chá) de água","2 colheres (sopa) de cebola picada","3 xícaras (chá) de leite desnatado","1 pitada de noz-moscada","Sal e pimenta-do-reino a gosto"]', 'Coloque todos os ingredientes numa panela e leve ao fogo baixo para cozinhar por cerca de 30 minutos ou até que os legumes fiquem macios.
Bata no liquidificador até obter um creme homogêneo.
Volte o creme para a panela e cozinhe por mais 10 minutos. Sirva a seguir.', NULL, NULL, 4, 106, 'jantar', TRUE);

-- 78. Salmão crocante com granola
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('db0a9923-e4c4-5c2d-bc8a-bf460365436e', 'Salmão crocante com granola', 'Prato principal · Colorretal', '["1 limão pequeno","6 dentes de alho picados","1 colher (chá) de hortelã fresca picada","1 fatia de pão integral light picada","2 xícaras (chá) de granola sem açúcar","1 colher (sopa) de margarina light (e mais para untar)","1 posta grande de salmão","Sal, pimenta vermelha e pimenta-do-reino a gosto"]', 'Descasque o limão e leve a casca ao processador.
Acrescente o alho, a hortelã, o pão, a pimenta vermelha, 1/4 de colher (chá) de pimenta-do-reino, a granola e a margarina. Misture e processe.
Em uma travessa, tempere o salmão com sal e o restante da pimenta-do-reino.
Cubra todo o salmão com os ingredientes processados e deixe pegar gosto por 10 minutos.
Coloque em uma assadeira untada e asse em forno preaquecido a 200 °C por 15 minutos.', NULL, NULL, 4, 106, 'almoco', TRUE);

-- 79. Torta integral de legumes
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('89949242-f330-5d43-a530-e2a3cb7f3b4d', 'Torta integral de legumes', 'Prato principal · Colorretal', '["1 berinjela grande em fatias","4 abobrinhas em fatias","2 cogumelos shiitake em fatias","2 tomates grandes em fatias","1 colher (sopa) de alho picado","1/4 de xícara (chá) de folhas de manjericão picadas","1/2 xícara (chá) de pão integral light esmigalhado","1/4 de xícara (chá) de queijo parmesão light","Sal e pimenta a gosto"]', 'Em uma frigideira, grelhe a berinjela, a abobrinha e o cogumelo temperados com sal e pimenta. Reserve.
Em uma assadeira de fundo removível, faça uma camada com 1/3 da berinjela.
Por cima, coloque metade da abobrinha, do cogumelo e do tomate, polvilhando alho, manjericão, sal e pimenta.
Repita o procedimento para a segunda camada, terminando com a berinjela.
Por último, distribua o pão e o parmesão. Leve ao forno e asse por cerca de 30 minutos.', NULL, NULL, 4, 93, 'almoco', TRUE);

-- 80. Arroz enriquecido
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('d45c9f60-5240-54f1-b462-9d79b86074ea', 'Arroz enriquecido', 'Prato principal · Como enriquecer os alimentos', '["1 copo de arroz","2 colheres (sopa) de farelo ou farinha enriquecida","Óleo","250 g de talos de couve, brócolis e espinafre bem lavados e picados","Casca de 1 abóbora ralada","Sal e tempero a gosto","Água fervente"]', 'Refogue o arroz com um pouco de óleo.
Acrescente o tempero, os talos, a casca da abóbora e o farelo.
Coloque água fervente o suficiente para cozinhar o arroz.', 'Se preferir, refogue os talos à parte e misture ao arroz já cozido.', NULL, 2, NULL, 'almoco', TRUE);

-- 81. Farofa de farinha láctea
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('e64970ba-4872-5237-8f14-b9061a998475', 'Farofa de farinha láctea', 'Prato principal · Como enriquecer os alimentos', '["2 colheres (sopa) de manteiga","100 g de banana-prata picadinha","50 g de nozes picadas grosseiramente","200 g de farinha láctea","2 colheres (sopa) de hortelã picada"]', 'Em uma frigideira, em fogo médio, derreta a manteiga e refogue a banana com as nozes.
Junte a farinha láctea e misture de 3 a 5 minutos ou até que a farinha comece a dourar.
Acrescente a hortelã picada, mexa bem, desligue o fogo e reserve.', NULL, NULL, 4, NULL, 'almoco', TRUE);

-- 82. Massa de pizza com farinha de linhaça
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('9fc017ac-ff5c-5f4f-a0ba-864104956659', 'Massa de pizza com farinha de linhaça', 'Prato principal · Como enriquecer os alimentos', '["1 xícara de água morna","1/2 colher (chá) de açúcar","2 1/2 colheres (chá) de fermento seco","1 colher (sopa) de azeite","1 1/2 xícara de farinha de trigo","1 xícara de farinha de linhaça","2 colheres (chá) de sal grosso"]', 'Coloque a água morna e o fermento no recipiente da batedeira.
Depois de 5 minutos, misture o azeite, o sal, as farinhas e o açúcar.
Sove ou bata com o gancho para massas pesadas até ficar elástica e macia.
Deixe descansar e crescer por aproximadamente 1 hora.
Abra em forma de disco e recheie a gosto.', NULL, NULL, 8, NULL, 'jantar', TRUE);

-- 83. Almôndegas de aveia com cenoura e molho de tomate
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('518bbc71-0849-5194-8831-124fcd9deb6d', 'Almôndegas de aveia com cenoura e molho de tomate', 'Prato principal · Diabetes', '["Almôndegas: 1 xícara (chá) de aveia em flocos","Almôndegas: 1 xícara (chá) de cenoura ralada fina","Almôndegas: 2 colheres (sopa) de cottage","Almôndegas: 1/2 xícara (chá) de farinha de trigo integral","Almôndegas: 2 ovos batidos","Almôndegas: 1/2 xícara (chá) de cheiro-verde","Almôndegas: 2 colheres (café) de sal","Almôndegas: 1 colher (sopa) de manjericão fresco picado","Molho: 700 g de tomate","Molho: 4 colheres (sopa) de azeite","Molho: 1 cebola picada","Molho: 2 dentes de alho espremidos","Molho: 1 xícara (chá) de manjericão fresco","Molho: 1 colher (sopa) de orégano","Molho: 1 colher (sopa) de salsinha picada","Molho: sal a gosto"]', 'Para as almôndegas, misture todos os ingredientes e faça pequenas bolinhas.
Coloque em uma assadeira untada e leve ao forno médio por cerca de 20 minutos ou até que fiquem sequinhas por fora. Reserve.
Para o molho, retire as sementes dos tomates e corte-os em pedaços pequenos.
Em uma panela, aqueça o azeite, refogue a cebola e o alho, acrescente os tomates e o sal e cozinhe por cerca de 20 minutos.
Junte as almôndegas e cozinhe por mais 20 minutos.
Desligue o fogo e acrescente o manjericão, o orégano e a salsinha.', NULL, NULL, 4, 201, 'almoco', TRUE);

-- 84. Arroz vegetariano
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('7359672a-4c71-5c77-b44f-2f717543774b', 'Arroz vegetariano', 'Prato principal · Diabetes', '["1 xícara (chá) de arroz integral cozido","1/2 xícara (chá) de erva-doce em cubos pequenos","1 colher (sopa) de uva-passa","1/2 xícara (chá) de maçã verde picada","1 colher (sopa) de hortelã picada","1/2 colher (café) de canela","1/4 de colher (café) de noz-moscada","1 colher (sobremesa) de azeite","1 colher (sopa) de folha de salsão cortada bem fina","1/2 limão (suco)","Sal a gosto"]', 'Em um recipiente, coloque a erva-doce, a uva-passa, a maçã verde e a hortelã. Tempere com sal, azeite, limão e canela.
Junte o arroz ainda quente, o salsão e a noz-moscada, mexa bem e deixe esfriar.
Depois de frio, coloque em uma vasilha com tampa e leve à geladeira.', NULL, NULL, 2, 87, 'almoco', TRUE);

-- 85. Bolo de farinha de banana verde
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('1ca371d3-65eb-5ef4-a6a0-946756761384', 'Bolo de farinha de banana verde', 'Prato principal · Diabetes', '["3 bananas-nanicas maduras","1 xícara (chá) de farinha de banana verde (e mais para polvilhar)","1/2 xícara (chá) de adoçante de uso culinário","2 ovos","1/2 colher (sopa) de fermento em pó","1 colher (sopa) de margarina light ou comum","1 xícara (chá) de leite desnatado ou suco de laranja","Canela a gosto"]', 'Bata no liquidificador os ovos e as bananas, acrescente os demais ingredientes e bata novamente.
Unte a assadeira com margarina e polvilhe com farinha de banana verde.
Asse em forno preaquecido por aproximadamente 30 minutos.
Depois de assado, polvilhe canela a gosto.', NULL, NULL, 20, 60, 'lanche', TRUE);

-- 86. Chips de batata yacon
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('2286206d-7371-54fd-b55f-6c155fa0f7f4', 'Chips de batata yacon', 'Prato principal · Diabetes', '["2 batatas yacon médias","2 colheres (sopa) de azeite de oliva","1/2 colher (chá) de alho em pó","2 colheres (chá) de sementes de gergelim","Sal e pimenta-do-reino a gosto"]', 'Misture o azeite, o sal, a pimenta e o alho. Reserve.
Lave bem as batatas com a casca, fatie em rodelas finas e coloque no azeite temperado.
Forre uma assadeira com papel-alumínio e coloque as rodelas uma a uma.
Leve ao forno preaquecido a 220 °C e asse de 30 a 40 minutos, virando a cada 10 minutos, até que fiquem douradas.
Salpique o gergelim por cima e sirva sozinha ou com um molho light de sua preferência.', 'Você pode substituir o alho em pó por um dente de alho amassado e adicionar ao azeite temperos como cheiro-verde, cebola, alecrim ou salsão.', NULL, 12, 35, 'lanche', TRUE);

-- 87. Crepe de Natal
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('de89f406-6462-5efb-931a-16b6ca61ef8e', 'Crepe de Natal', 'Prato principal · Diabetes', '["Massa: 250 ml de leite desnatado","Massa: 2 ovos","Massa: 2 colheres (sopa) de farinha de trigo","Massa: 1 colher (sopa) de farelo de trigo","Massa: 1 colher (chá) de manteiga para untar","Molho: 30 g de purê de tomate","Molho: 1 kg de tomate-cereja","Molho: 10 g de margarina light","Molho: 20 g de cebola picada","Molho: 1 xícara (chá) de caldo de galinha","Molho: 30 g de manjericão","Molho: 2 colheres (sopa) de queijo ralado","Recheio: 1 1/2 xícara de proteína de soja texturizada","Recheio: 500 g de castanhas portuguesas cozidas e descascadas","Recheio: 2 colheres (chá) de salsinha picada","Recheio: 1 colher (sopa) de cebola ralada","Recheio: 1 colher (sopa) de azeite","Recheio: 2 colheres (sopa) de queijo ralado","Recheio: sal a gosto"]', 'Massa: bata os ingredientes líquidos no liquidificador, acrescente os secos e bata novamente. Deixe descansar por 15 minutos na geladeira.
Em uma frigideira, derreta a manteiga em fogo baixo, acrescente a massa, espere cozinhar e solte com o auxílio de uma colher.
Recheio: doure a cebola no azeite, acrescente as castanhas para refogar, a salsa e, por fim, a proteína texturizada, formando uma farofa (se necessário, pingue caldo de legumes para umedecer).
Molho: lave os tomates e corte em quatro. Doure a cebola na margarina, acrescente o purê de tomate, os tomates e o caldo de galinha e cozinhe por aproximadamente 20 minutos. Desligue o fogo e acrescente o manjericão.
Recheie os crepes, cubra com o molho, polvilhe queijo ralado e leve ao forno para gratinar por 15 minutos. Sirva em seguida.', NULL, NULL, NULL, 8, 'jantar', TRUE);

-- 88. Estrogonofe de carne com suplemento
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('fbda65ed-6119-5113-b0fd-1e8983f9a625', 'Estrogonofe de carne com suplemento', 'Prato principal · Diabetes', '["100 g de filé-mignon em tiras","1 colher (sopa) de cebola picada","1 colher (sobremesa) de óleo","1 colher (sopa) de molho de tomate natural","1 colher (sobremesa) de champignon","2 colheres (sopa) de creme de leite","6 colheres (sopa) de suplemento nutricional em pó sem sabor"]', 'Doure a cebola no óleo, acrescente o filé-mignon e deixe fritar.
Acrescente o molho de tomate e o champignon e cozinhe por 5 minutos.
Abaixe o fogo, coloque o creme de leite, mexa bem e deixe cozinhar por 3 minutos.
Desligue o fogo e acrescente o suplemento nutricional. Sirva a seguir.', NULL, NULL, 1, 509, 'almoco', TRUE);

-- 89. Gratinado de batata yacon
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('509cb4a5-3cd4-552a-93ce-bddef78638e2', 'Gratinado de batata yacon', 'Prato principal · Diabetes', '["1 maço de brócolis","1 cebola picada","Sal e pimenta-do-reino a gosto","200 g de batata yacon em rodelas","Molho: 1 colher (sopa) de farinha de trigo","Molho: 1 xícara (chá) de leite desnatado","Molho: 1/2 colher (sopa) de margarina","Molho: noz-moscada a gosto (opcional)","200 g de queijo branco ralado"]', 'Cozinhe o brócolis e corte em pedacinhos. Tempere com a cebola, sal e pimenta-do-reino e reserve.
Em outra panela, cozinhe a batata yacon até ficar macia, escorra e reserve.
Molho: derreta a margarina, acrescente a farinha formando um creme dourado e coloque o leite aos poucos, cuidando para não formar grumos. Acerte o sal e acrescente noz-moscada, se desejar.
Montagem: alterne camadas de batata e brócolis em um refratário, despeje o molho e polvilhe o queijo branco ralado.
Leve ao forno para gratinar e sirva quente.', NULL, NULL, 8, 72, 'almoco', TRUE);

-- 90. Nhoque de banana verde
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('e62dde62-e4fd-5c71-bfa8-748c6043d4cf', 'Nhoque de banana verde', 'Prato principal · Diabetes', '["18 bananas-nanicas verdes","1 batata grande","5 xícaras (chá) de queijo parmesão ralado","1 colher (sopa) de manjericão picado","2 xícaras (chá) de farinha de trigo","Sal e pimenta-do-reino a gosto","Molho de tomate para servir"]', 'Cozinhe as bananas e a batata com água por 30 minutos ou até ficarem macias.
Descasque e, ainda quentes, passe no espremedor. Acrescente o sal, a pimenta, o parmesão e o manjericão e deixe esfriar.
Junte a farinha e misture bem.
Faça rolinhos com a massa e corte em pedaços de 1,5 cm.
Ferva 4 litros de água e cozinhe os nhoques até subirem à superfície. Retire rapidamente com uma escumadeira.
Escorra e sirva com molho de tomate.', NULL, NULL, 8, 442, 'almoco', TRUE);

-- 91. Pão de forma sem glúten de farinha de banana verde
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('cc9ffdc6-f264-566c-8fff-b83b070e750c', 'Pão de forma sem glúten de farinha de banana verde', 'Prato principal · Diabetes', '["2 xícaras (chá) de farinha de banana verde (e mais para polvilhar)","2 xícaras (chá) de água morna (ou leite)","2 ovos","1/2 xícara de óleo","1 colher (café) de sal","2 tabletes de fermento para pão (15 g cada)","3 colheres (sopa) de adoçante de uso culinário"]', 'Em um recipiente, misture a farinha de banana verde, o adoçante e o sal e reserve.
Bata no liquidificador o fermento esfarelado, os ovos, o óleo e a água morna.
Adicione a mistura reservada, mexendo bem.
Coloque a massa em uma forma de pão untada e polvilhada com farinha de banana verde.
Cubra com um pano e deixe repousar por cerca de 1 hora, até dobrar de volume.
Asse em forno preaquecido a 180–210 °C por 20 minutos.', NULL, NULL, 10, 214, 'cafe', TRUE);

-- 92. Torre de batata yacon, berinjela e hambúrguer de frango
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('b3f38667-f0ad-52a3-8cd6-796d2ad24e8c', 'Torre de batata yacon, berinjela e hambúrguer de frango', 'Prato principal · Diabetes', '["4 batatas yacon descascadas em cubos médios","1 berinjela média (cerca de 10 cm de diâmetro)","1 peito de frango pequeno","1 cebola média picada","8 ramos de salsinha picada (só as folhas)","4 colheres (sopa) de óleo de soja","Sal e orégano desidratado a gosto"]', 'Coloque as batatas em uma panela, cubra com água e cozinhe por 35 minutos ou até ficarem al dente. Escorra e reserve.
Corte a berinjela em 8 rodelas de 1 cm, salpique sal dos dois lados e reserve.
Limpe o peito de frango (sem pele, ossos e cartilagens), pique e bata no processador com a cebola e o sal até obter uma massa homogênea. Misture a salsinha.
Modele 4 hambúrgueres de 10 cm de diâmetro.
Lave as rodelas de berinjela e seque com papel-toalha.
Aqueça metade do óleo numa frigideira antiaderente e grelhe os hambúrgueres até dourarem dos dois lados. Na mesma frigideira, com o óleo restante, grelhe a berinjela até dourar dos dois lados.
Com um aro de 10 cm sobre o prato, disponha 1 rodela de berinjela, 1 hambúrguer e a batata. Retire o aro, salpique orégano e sirva em seguida.', NULL, NULL, 4, 187, 'almoco', TRUE);

-- 93. Torta salgada de farinha de banana verde
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('8e90a707-68d1-57c2-9093-ee1999600510', 'Torta salgada de farinha de banana verde', 'Prato principal · Diabetes', '["Massa: 1/2 xícara (chá) de óleo","Massa: 2 xícaras (chá) de leite desnatado","Massa: 3 ovos","Massa: 2 colheres (sopa) de queijo ralado","Massa: 1 1/2 xícara (chá) de farinha de banana verde (e mais para polvilhar)","Massa: 1 colher (sopa) rasa de fermento em pó","Recheio: 2 latas de seleta de legumes","Recheio: 2 latas de sardinha","Recheio: 1 xícara (chá) de palmito picado","Recheio: 1 cebola grande picada","Recheio: 2 dentes de alho moídos","Recheio: 2 tomates grandes sem pele"]', 'Massa: bata tudo no liquidificador e coloque em assadeira untada e polvilhada com farinha de banana verde.
Recheio: amasse as sardinhas, coloque sobre a massa e decore com os demais ingredientes.
Leve ao forno preaquecido e asse por aproximadamente 30 minutos.', 'Pode utilizar outros tipos de recheio.', NULL, 20, 155, 'lanche', TRUE);

-- 94. Atum ao espumante com molho de maracujá
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('df5939da-1d63-5115-a410-6bfd335a7fbe', 'Atum ao espumante com molho de maracujá', 'Prato principal · Doenças cardiovasculares', '["300 g de filé de atum fresco","1 copo de espumante","1 colher (sopa) de endro (dill)","1 maracujá (polpa)","1 abobrinha","1 batata pequena","6 tomates-cereja","3 talos de salsão","1 pitada de pimenta-do-reino","1 colher (sopa) de azeite extravirgem","Amido de milho","Papel-manteiga"]', 'Em uma vasilha, deixe o atum marinar no espumante por cerca de 1 hora.
Corte a abobrinha em anéis, a batata em meia-lua e pique um dos talos de salsão. Reserve.
Abra o papel-manteiga e regue com azeite. Disponha as batatas, sobre elas a abobrinha e depois o filé de atum.
Regue o peixe com um fio de azeite e disponha sobre ele o endro, o salsão picado e os tomates-cereja. Tempere com a pimenta e embrulhe no papel-manteiga.
Corte os outros dois talos de salsão em tiras e faça uma cama com eles em uma assadeira. Coloque o peixe embrulhado por cima e leve ao forno alto por cerca de 20 minutos.
Molho: em uma frigideira aquecida, ferva o espumante que sobrou da marinada, adicione a polpa do maracujá e, quando voltar a ferver, acrescente o amido dissolvido em água fria até ficar espesso.
Sirva o atum com o molho e os legumes.', NULL, NULL, NULL, NULL, 'almoco', TRUE);

-- 95. Bolo de linhaça
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('539cb43a-758d-5a37-8574-b41cf2553b66', 'Bolo de linhaça', 'Prato principal · Doenças cardiovasculares', '["200 g de margarina","2 xícaras (chá) de açúcar mascavo","Ovos (a receita original não informa a quantidade)","100 ml de óleo de canola","2 xícaras (chá) de farinha de trigo integral","1 colher (sopa) de fermento em pó","2 colheres (sopa) de leite de soja em pó","1/2 xícara (chá) de água","1 pitada de sal","1 colher (sopa) de essência de baunilha","2 colheres (sopa) de sementes de linhaça","1/2 xícara (chá) de castanhas-do-pará picadas","2 colheres (sopa) de raspas de limão e laranja"]', 'Bata a margarina com o açúcar até formar um creme. Coloque os ovos, um a um, incorporando ao creme.
Acrescente a farinha aos poucos para o creme não perder a leveza.
Adicione o fermento, o leite, a água, o sal e a essência e bata por mais 5 minutos ou até a massa ficar homogênea.
Acrescente as sementes de linhaça, as castanhas e as raspas de limão e laranja e misture com uma espátula.
Coloque em uma forma untada e enfarinhada e asse em forno preaquecido a 180 °C por cerca de 45 minutos.', NULL, NULL, 6, 86, 'lanche', TRUE);

-- 96. Canelone de berinjela
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('6b4e51bd-70e7-5532-9334-ecab0f43415b', 'Canelone de berinjela', 'Prato principal · Doenças cardiovasculares', '["500 g de berinjelas grandes","300 g de ricota","2 colheres (sopa) de uvas-passas","4 colheres (sopa) de nozes picadas","3 xícaras (chá) de molho de tomate caseiro","1 maço de manjericão","1 xícara (chá) de queijo branco ralado","Azeite extravirgem","Pimenta-do-reino a gosto"]', 'Corte as berinjelas em fatias, grelhe em uma frigideira antiaderente aquecida e reserve.
Em uma tigela, misture a ricota, as uvas-passas, as nozes e o manjericão picado (guarde um ramo para decorar).
Coloque o recheio no meio de cada fatia de berinjela e enrole como um canelone.
Em um refratário, coloque um pouco do molho de tomate e disponha os canelones.
Despeje o restante do molho, salpique o queijo branco e leve ao forno alto para gratinar. Sirva quente.', NULL, NULL, NULL, NULL, 'almoco', TRUE);

-- 97. Cuscuz marroquino de legumes grelhados (berinjelas e abobrinhas)
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('33abda48-4501-57af-a173-8d029b2788c2', 'Cuscuz marroquino de legumes grelhados (berinjelas e abobrinhas)', 'Prato principal · Doenças cardiovasculares', '["1 xícara (chá) de quinoa","1 xícara (chá) de água","1 abobrinha","1 berinjela","1 maço de sálvia","4 colheres (sopa) de azeite","2 limões (suco)","Pimenta a gosto"]', 'Coloque a quinoa em uma vasilha com a água e deixe absorver por completo.
Enquanto isso, corte a berinjela e a abobrinha em anéis, grelhe em uma panela antiaderente e reserve.
Corte a sálvia grosseiramente e misture aos legumes.
Em uma vasilha grande, misture a quinoa com os legumes e a sálvia, o azeite e o suco dos limões.
Tempere com pimenta a gosto e sirva frio.', NULL, NULL, NULL, NULL, 'almoco', TRUE);

-- 98. Espaguete de abobrinha à mineira
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('d69cf0c8-c9ba-5ab1-bd19-0592380cfcbf', 'Espaguete de abobrinha à mineira', 'Prato principal · Doenças cardiovasculares', '["300 g de abobrinhas compridas","200 g de queijo minas em cubos","1 colher (sopa) de manjericão picado","1 colher (sopa) de cebola picadinha","1 colher (chá) de alho picado","80 g de couve-manteiga em fios","100 g de tomates em cubos","Caldo de legumes caseiro","1 fio de óleo"]', 'Rale as abobrinhas no sentido do comprimento, formando uma espécie de espaguete.
Cozinhe no caldo de legumes até ficar al dente e escorra.
Em uma frigideira, aqueça um fio de óleo, refogue a cebola e o alho e acrescente a couve, o tomate e o queijo.
Desligue o fogo, misture a abobrinha e o manjericão e sirva quente.', NULL, NULL, NULL, NULL, 'almoco', TRUE);

-- 99. Medalhão de filé de frango light
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('679b89a9-168f-5221-9ec6-4076872097dd', 'Medalhão de filé de frango light', 'Prato principal · Doenças cardiovasculares', '["500 g de peito de frango","5 cenouras grandes","50 g de gengibre","1 ramo de alecrim","1 colher (sopa) de azeite extravirgem","4 colheres (sopa) de vinagrete","3 dentes de alho"]', 'Com a ajuda de um aro, corte os peitos de frango em medalhões.
Rale o gengibre, misture com o azeite, o alho e o alecrim e tempere o frango. Leve à geladeira por 30 minutos.
Descasque as cenouras e faça lâminas finas com um descascador de legumes.
Envolva os medalhões com as lâminas de cenoura e prenda com palitos.
Coloque em uma assadeira untada e leve ao forno por 15 minutos.
Cubra com o vinagrete e asse por mais 20 minutos ou até o frango chegar ao ponto.', 'Pode ser servido com molho de iogurte.', NULL, NULL, NULL, 'almoco', TRUE);

-- 100. Filé de peixe recheado com cama de legumes
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('3405878b-5d4a-5f17-b27b-9d15d9027041', 'Filé de peixe recheado com cama de legumes', 'Prato principal · Estômago / Intestino', '["Suco de 1 limão","500 g de abobrinha em cubos","1 kg de filé de peixe","500 g de berinjela em cubos","1/2 pimentão amarelo em tiras","1/2 pimentão vermelho em tiras","2 cebolas em rodelas","2 colheres (sopa) de azeite de oliva","Sal a gosto"]', 'Deixe o filé de peixe marinando no limão com sal.
Recheie os filés com os pimentões, enrole e prenda com um palito.
Em uma forma, distribua os filés e o restante dos legumes e regue com azeite.
Leve ao forno preaquecido, coberto com papel-alumínio, por 15 minutos.
Retire o papel e deixe assar por mais 15 minutos.', NULL, NULL, 6, 203, 'almoco', TRUE);

-- 101. Lasanha de abobrinha com frango
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('b2e86986-9bc8-556e-ba56-661cb51e2991', 'Lasanha de abobrinha com frango', 'Prato principal · Estômago / Intestino', '["700 g de abobrinha em fatias no sentido do comprimento","400 ml de molho de tomate caseiro","500 g de filé de frango desfiado","300 g de queijo branco em cubos","Orégano e manjericão a gosto"]', 'Cubra o fundo de um refratário com um pouco de molho e coloque uma parte do frango, o queijo, o orégano e o manjericão.
Distribua uma camada de abobrinha e, em seguida, molho, frango, queijo, orégano e manjericão.
Repita até terminar a abobrinha e finalize com o queijo e o frango.
Leve ao forno médio preaquecido por cerca de 40 minutos.', NULL, NULL, 8, 166, 'almoco', TRUE);

-- 102. Filé-mignon com crosta de linhaça
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('d83b68a8-e73f-5dc3-b090-4ef68f337d9b', 'Filé-mignon com crosta de linhaça', 'Prato principal · Fibras', '["300 g de filé-mignon","1 xícara (chá) de linhaça em pó","6 colheres (sopa) de linhaça em sementes","1 colher (sopa) de manteiga","1/2 xícara (chá) de miolo de pão","1 colher (sopa) de talos de salsinha","1 colher (sopa) de azeite"]', 'Com um mixer ou processador, faça uma massa com a manteiga, o miolo de pão e os talos de salsinha.
Misture à massa, manualmente, metade da linhaça em pó e em sementes. Reserve a outra metade para a farofa.
Coloque a massa entre dois pedaços de filme plástico sobre uma bancada lisa e abra com um rolo. Leve ao congelador por cerca de 30 minutos.
Aqueça uma frigideira com o azeite e grelhe o filé-mignon, deixando-o malpassado.
Cubra com a massa e depois com a farofa de linhaça e leve ao forno para terminar o cozimento e gratinar a crosta. Sirva na hora.', NULL, NULL, 6, 117, 'almoco', TRUE);

-- 103. Hambúrguer de frango
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('55c2adcf-b70c-5f31-9945-22a72ee9c8fb', 'Hambúrguer de frango', 'Prato principal · Fibras', '["500 g de peito de frango moído","1 cebola ralada","2 dentes de alho picados","1 ovo","2 colheres (sopa) de farinha de aveia","3 colheres (sopa) de farinha de trigo integral","1 colher (sopa) de azeite de oliva","Sal a gosto"]', 'Misture o frango, a cebola, o alho, o ovo, as farinhas e o sal.
Modele a mistura no formato de hambúrgueres.
Unte uma assadeira com azeite e asse em forno preaquecido até que fiquem dourados.', NULL, NULL, 6, 178, 'almoco', TRUE);

-- 104. Panqueca integral com recheio de frango e espinafre
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('222e0ed3-dc51-53eb-b804-04f677297ab6', 'Panqueca integral com recheio de frango e espinafre', 'Prato principal · Fibras', '["Massa: 2 ovos","Massa: 2 colheres (sopa) de óleo","Massa: 200 ml de leite","Massa: 3 colheres (sopa) de farinha de trigo integral","Massa: 1 colher (sopa) de farinha de trigo","Massa: 5 colheres (sopa) de farinha de aveia","Massa: sal a gosto","Massa: óleo para untar","Recheio: 1/2 xícara de cebola picada","Recheio: 1 colher (sopa) de azeite de oliva","Recheio: 2 colheres (sopa) de farinha de aveia","Recheio: 1 maço de folhas de espinafre cozidas e picadas","Recheio: 2 xícaras de peito de frango desfiado","Recheio: 200 g de queijo cottage","Recheio: sal"]', 'Massa: bata no liquidificador todos os ingredientes.
Em uma frigideira untada, coloque 1/2 concha da massa e espalhe. Cozinhe, vire do outro lado e reserve.
Recheio: refogue a cebola no azeite e junte o espinafre, a aveia, o frango, o cottage e o sal.
Recheie as panquecas, enrole e sirva a seguir.', NULL, NULL, 6, 301, 'jantar', TRUE);

-- 105. Risoto integral
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('4bab75ba-babd-5a67-8159-f7de41c737a1', 'Risoto integral', 'Prato principal · Fibras', '["200 g de arroz integral","200 g de abóbora-moranga em cubos","2 colheres (sopa) de alecrim","200 g de frango em cubos pequenos","100 g de parmesão ralado","1 xícara (chá) de vinho branco","2 colheres (sopa) de manteiga","1 cebola picadinha","1 talo de salsão picadinho","Água"]', 'Em uma panela, derreta metade da manteiga e doure os cubinhos de frango.
Coloque a cebola e o salsão e deixe dourar.
Coloque o alecrim picado e o arroz, frite por cerca de 1 minuto e acrescente o vinho branco.
Espere secar, acrescente a mesma quantidade de água e a abóbora em cubinhos.
Deixe cozinhar até o arroz ficar macio (se precisar, acrescente mais água).
Ao final, acrescente o parmesão e o restante da manteiga, misture bem e sirva na hora.', NULL, NULL, 6, 118, 'almoco', TRUE);

-- 106. Rolê de linguado com recheio cremoso de grãos ao molho de laranja
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('9a27af48-0710-5451-9ded-82005c07fcd5', 'Rolê de linguado com recheio cremoso de grãos ao molho de laranja', 'Prato principal · Fibras', '["4 filés de linguado","1/2 xícara (chá) de cream cheese","2 colheres (sopa) de soja em grãos (cozida)","6 colheres (sopa) de trigo em grãos (cozido)","2 colheres (sopa) de cebolinha picada","1 xícara (chá) de creme de leite fresco","1 laranja","Sal e pimenta-do-reino a gosto"]', 'No liquidificador, bata os grãos de soja com os de trigo e o cream cheese até virar uma massa. Misture a cebolinha e reserve na geladeira.
Abra o filé de linguado em uma tábua e tempere com pimenta e sal.
No centro, coloque uma ou duas colheres do creme, enrole e amarre.
Aqueça uma frigideira e doure todos os lados do rolê. Termine o cozimento no forno.
Na mesma frigideira, coloque o creme de leite e deixe abrir fervura. Desligue e acrescente o suco de meia laranja.
Monte o rolê no prato com o molho por cima.', NULL, NULL, 4, 422, 'almoco', TRUE);

-- 107. Fagotino de badejo
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('e7f4d167-4229-5df0-9968-63bb7fbd35ff', 'Fagotino de badejo', 'Prato principal · Hipertensão', '["4 filés de badejo","50 g de salsinha picada","40 ml de azeite extravirgem","4 folhas de erva-cidreira","4 batatas","1 limão (suco)","Pimenta-do-reino a gosto"]', 'Lamine as batatas no mandolim, deixando as fatias o mais finas possível. Cozinhe por alguns segundos em água fervente.
Em uma assadeira untada com azeite, disponha algumas fatias, fazendo uma cama para o peixe.
Coloque um filé de badejo dobrado sobre as fatias e tempere com pimenta, azeite, uma folha de erva-cidreira, salsinha e suco de limão.
Cubra o peixe com mais fatias de batata, deixando-o completamente coberto.
Regue com azeite para as batatas gratinarem e leve ao forno a 200 °C por cerca de 20 minutos.', NULL, NULL, 4, 139, 'almoco', TRUE);

-- 108. Filé ao molho de maracujá
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('4b3289f2-4b2a-5d39-ba3c-460fbbbb2b45', 'Filé ao molho de maracujá', 'Prato principal · Hipertensão', '["2 maracujás grandes","1 xícara (chá) de água","2 dentes de alho","1 cebola ralada","6 escalopes de filé-mignon","1 colher (sopa) de margarina vegetal sem sal","1 1/2 xícara (chá) de creme de leite light","100 g de farinha de trigo"]', 'Retire a polpa do maracujá, acrescente a água, peneire e reserve as sementes.
Junte o alho e a cebola ao suco, misture bem e despeje sobre os escalopes. Reserve por 30 minutos.
Escorra os escalopes, reservando o suco de maracujá, e passe-os na farinha de trigo.
Aqueça uma frigideira com a margarina e frite os escalopes, um lado de cada vez.
Na mesma frigideira, coloque o suco de maracujá e deixe levantar fervura. Coe e volte à frigideira.
Junte o creme de leite, misture bem, aqueça e regue os filés. Decore com as sementes de maracujá.', NULL, NULL, 3, 348, 'almoco', TRUE);

-- 109. Iscas de carne com ervas finas
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('d38534f4-124b-5d50-be3f-8336535a127e', 'Iscas de carne com ervas finas', 'Prato principal · Hipertensão', '["600 g de contrafilé","1 colher (sopa) de margarina vegetal sem sal","1 xícara (chá) de vinho branco seco","1 xícara (chá) de creme de leite light","1 colher (sopa) de alecrim fresco","1 colher (sopa) de louro fresco","2 colheres (sopa) de manjericão fresco","1/2 xícara (chá) de amido de milho"]', 'Corte o contrafilé em iscas finas, perpendiculares às fibras, e passe no amido de milho.
Aqueça uma frigideira com a margarina, doure as iscas e reserve.
Na mesma frigideira, coloque o vinho e deixe ferver, raspando o fundo com uma colher. Coe, leve novamente ao fogo e deixe ferver.
Acrescente o creme de leite, mexa bem e, quando levantar fervura, diminua o fogo. Mexa até engrossar.
Ao final, coloque as ervas e a carne. Sirva em seguida.', NULL, NULL, 6, 291, 'almoco', TRUE);

-- 110. Lasanha de abobrinha com ricota e muçarela
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('a868ee65-fabe-5325-b3da-46eedde61ebd', 'Lasanha de abobrinha com ricota e muçarela', 'Prato principal · Hipertensão', '["300 ml de molho de tomate caseiro","1 cebola ralada","50 g de manjericão fresco","50 g de tomilho","10 ml de óleo de soja","150 g de ricota","150 g de muçarela","3 abobrinhas"]', 'Refogue a cebola no óleo, junte o molho de tomate e as ervas e reserve.
Rale os queijos e reserve.
Fatie as abobrinhas no comprimento e escalde em água fervente, deixando-as pré-cozidas.
Em uma assadeira, repita camadas de molho, abobrinha, ricota e muçarela.
Na última camada, coloque o molho sobre as abobrinhas e os queijos sobre o molho.
Leve ao forno para gratinar.', NULL, NULL, 6, 334, 'almoco', TRUE);

-- 111. Sobrecoxa com iogurte e hortelã
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('315d8316-6589-55e3-8fa7-5bd0ffef007b', 'Sobrecoxa com iogurte e hortelã', 'Prato principal · Hipertensão', '["1 colher (sopa) de margarina vegetal sem sal","4 sobrecoxas sem pele","40 g de gengibre","100 ml de azeite","200 ml de iogurte desnatado","50 g de hortelã picada","4 folhas de louro","4 dentes de alho amassados"]', 'Um dia antes: em uma travessa, disponha duas sobrecoxas e, sobre elas, uma folha de louro, um dente de alho amassado, gengibre ralado, hortelã picada e iogurte.
Cubra com as outras duas sobrecoxas, repita os temperos e reserve na geladeira.
No dia: retire o excesso de temperos, reservando o líquido.
Aqueça uma panela com um fio de azeite, doure as sobrecoxas e leve ao forno por cerca de 40 minutos a 180 °C.
Enquanto isso, bata o molho de iogurte com os temperos e aqueça, sem deixar ferver.
Disponha as sobrecoxas em uma travessa, regue com o molho de iogurte e decore com um ramo de hortelã.', NULL, NULL, 4, 308, 'almoco', TRUE);

-- 112. Filé de peixe ao molho de tomate
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('d0a3ea65-6845-5258-a44b-393e6eb186be', 'Filé de peixe ao molho de tomate', 'Prato principal · Insuficiência renal e hepática', '["1 filé de peixe","1 colher (sopa) de suco de limão","3 colheres (sobremesa) de azeite","3 colheres (sopa) de cebola picada","1 tomate pequeno em cubos","1 folha de louro","1 colher (chá) de cebolinha","100 ml de água","6 colheres (sopa) de suplemento nutricional em pó sem sabor","Sal e manjericão a gosto"]', 'Tempere o filé de peixe com suco de limão e sal e reserve.
Em uma panela, refogue em duas colheres (sobremesa) de azeite a cebola, o tomate, o louro, o manjericão, a cebolinha e o sal. Cozinhe até engrossar o molho e desligue o fogo.
Em um recipiente à parte, dilua o suplemento nutricional na água e acrescente ao molho. Reserve.
Grelhe o filé de peixe em uma colher (sobremesa) de azeite.
No momento de servir, coloque o molho sobre o peixe.', 'Peixes sugeridos: saint peter, linguado, pescada-branca e salmão.', NULL, 1, 498, 'almoco', TRUE);

-- 113. Bolinho de legumes sem lactose
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('1eba8dba-d0aa-5174-968c-3c11203c76a3', 'Bolinho de legumes sem lactose', 'Prato principal · Lactose', '["Massa: 3 1/2 colheres (sopa) de creme de soja","Massa: 1 xícara (chá) de água","Massa: 6 colheres (sopa) de óleo de soja","Massa: 1/2 cebola picada","Massa: 1 tablete de caldo de frango","Massa: 1 colher (sopa) de margarina sem leite","Massa: 2 xícaras (chá) de farinha de trigo","Massa: 1 pitada de sal","Recheio: 3 1/2 colheres (sopa) de creme de soja","Recheio: 1 xícara (chá) de água","Recheio: 2 colheres (sopa) de margarina sem leite","Recheio: 2 colheres (sopa) de farinha de trigo","Recheio: 1 cenoura média picada","Recheio: 1/2 couve-flor média","Recheio: 3 colheres (sopa) de salsinha picada","Recheio: 1 pitada de sal","1 envelope de gelatina incolor sem sabor","Farinha de rosca para empanar","Óleo para fritar"]', 'Massa: misture o creme de soja com a água e reserve. Aqueça o óleo, doure a cebola e acrescente o tablete de caldo de frango.
Adicione a margarina e o creme de soja diluído e mexa. Coloque a farinha aos poucos até obter uma massa lisa que desgrude do fundo da panela.
Retire do fogo e deixe esfriar por 15 minutos.
Recheio: misture o creme de soja com a água. Derreta a margarina, acrescente a farinha e mexa até formar uma pasta. Adicione o creme de soja diluído aos poucos para não empelotar.
Refogue a cenoura, a couve-flor e a salsinha, adicione ao molho e misture até obter uma massa com os legumes.
Para empanar: amasse pequenas porções de massa na mão, recheie e enrole formando o bolinho.
Prepare a gelatina conforme a embalagem, passe os bolinhos na gelatina e depois na farinha de rosca.
Frite em óleo bem quente até dourar.', NULL, NULL, NULL, NULL, 'lanche', TRUE);

-- 114. Estrogonofe de carne sem lactose
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('5e47a0c7-5754-5804-bdcf-af369314bd5a', 'Estrogonofe de carne sem lactose', 'Prato principal · Lactose', '["1 colher (sopa) de óleo","1 cebola grande picada em cubos","1 dente de alho","600 g de alcatra ou coxão mole em cubinhos","5 colheres (sopa) de polpa de tomate","250 g de cogumelo-paris (champignon)","2 colheres (sopa) de farinha de trigo","3 copos de bebida à base de soja sem sabor","1 colher (café) de pimenta-do-reino","Sal a gosto"]', 'Aqueça o óleo em uma panela, coloque a cebola e o alho e deixe dourar.
Acrescente a carne e deixe cozinhar por inteiro. Adicione o sal e a pimenta e misture bem.
Acrescente a polpa de tomate e em seguida os cogumelos.
Adicione a farinha e misture bem até formar um creme.
Acrescente a bebida de soja e continue mexendo até engrossar.
Sirva quente com arroz.', NULL, NULL, NULL, NULL, 'almoco', TRUE);

-- 115. Pão de queijo sem lactose
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('1e3d061a-2f67-5264-8c2f-73145519d5ca', 'Pão de queijo sem lactose', 'Prato principal · Lactose', '["2 ovos","1/2 xícara (chá) de óleo","2 xícaras (chá) de polvilho doce","1 xícara (chá) de pasta de soja","Sal a gosto","Orégano"]', 'Bata os ovos e o óleo com um batedor de arame (fouet).
Acrescente a pasta de soja e bata mais um pouco até ficar homogêneo.
Adicione o polvilho doce peneirado e mexa delicadamente com uma colher.
Finalize com orégano e ajuste o sal se necessário.
Asse em forno preaquecido a 170 °C por aproximadamente 17 minutos ou até ficarem ligeiramente dourados.', NULL, NULL, NULL, NULL, 'lanche', TRUE);

-- 116. Quiche de frango sem lactose
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('f0faaafa-516f-5b15-864c-0701db33eb89', 'Quiche de frango sem lactose', 'Prato principal · Lactose', '["Massa: 2 xícaras (chá) de farinha de trigo","Massa: 1 colher (chá) de sal","Massa: 3/4 de xícara (chá) de margarina sem leite","Massa: 4 a 5 colheres (sopa) de água gelada","Recheio: 1 colher (sopa) de óleo","Recheio: 1 cebola pequena em cubinhos","Recheio: 1 peito de frango cozido e desfiado","Recheio: 3 tomates sem pele e sem sementes em cubos","Recheio: 3 ramos de salsinha picada","Recheio: 1 colher (sopa) de sal","Recheio: 4 colheres (sopa) cheias de bebida à base de soja sem sabor (em pó)","Recheio: 2 xícaras (chá) de água","Recheio: 2 ovos","Recheio: 1 gema","Recheio: pimenta-do-reino moída na hora"]', 'Massa: misture a farinha com o sal em uma tigela grande. Adicione a margarina e trabalhe com as pontas dos dedos até obter uma farofa.
Acrescente a água gelada aos poucos e mexa até formar uma massa macia (não trabalhe demais). Enrole em filme plástico e leve à geladeira por cerca de 30 minutos.
Recheio: aqueça o óleo em uma panela e refogue a cebola em fogo médio-baixo por cerca de 3 minutos. Adicione o frango e mexa.
Adicione o tomate e tempere com pimenta e metade do sal. Desligue o fogo, adicione a salsinha e deixe esfriar.
Em outra vasilha, dilua a bebida de soja nas 2 xícaras de água, acrescente os ovos, a gema e o restante do sal e mexa bem.
Montagem: abra a massa com um rolo entre dois sacos plásticos e forre uma forma de quiche de 25 cm.
Coloque o refogado de frango frio sobre a massa e, por cima, a mistura de bebida de soja com ovos.
Asse em forno preaquecido a 180 °C por cerca de 30 minutos ou até a superfície começar a dourar. Sirva em seguida.', NULL, NULL, NULL, NULL, 'almoco', TRUE);

-- 117. Salmão ao molho de espinafre
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('81a4280b-f636-58ce-9824-29310ee695e2', 'Salmão ao molho de espinafre', 'Prato principal · Lactose', '["500 g de filé de salmão","1 cebola em rodelas","1 cenoura picada","1/2 pimentão vermelho em rodelas","1 maço de espinafre","200 ml de leite de coco","Azeite de oliva","Gengibre","Alecrim","Pimenta-do-reino (de preferência moída na hora)","Sal a gosto","Papel-manteiga"]', 'Salmão: em uma forma retangular de vidro, coloque os filés e tempere com alecrim, pimenta-do-reino, sal e gengibre.
Por cima, coloque a cebola, a cenoura e o pimentão e regue com azeite.
Corte o papel-manteiga com uma folga de 2 cm para as bordas, amasse e molhe-o em água corrente. Escorra o excesso e cubra a forma por inteiro.
Leve ao forno médio por 20 a 30 minutos.
Molho: em uma panela com água, coloque as folhas de espinafre lavadas e deixe levantar fervura. Escorra bem.
Bata o espinafre no liquidificador com metade do leite de coco e uma pitada de sal, adicionando aos poucos o restante do leite de coco até ficar com consistência de molho.
Sirva o salmão com o molho de espinafre.', NULL, NULL, NULL, NULL, 'almoco', TRUE);

-- 118. Risoto ao vinho tinto
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('cd2ef047-9b2a-558e-a058-961f41814eb0', 'Risoto ao vinho tinto', 'Prato principal · Licopeno e polifenóis', '["3 xícaras (chá) de arroz arbóreo","2 xícaras (chá) de queijo parmesão ralado (e mais para decorar)","2 xícaras (chá) de cebola picada","1 xícara (chá) de vinho tinto","2 xícaras (chá) de azeite","1/2 tablete de caldo de legumes","Água","Sal a gosto"]', 'Em uma panela, em fogo médio, coloque o azeite, o caldo de legumes e a cebola e mexa bem até dourar.
Acrescente o arroz e misture.
Acrescente o vinho, complete com água e tempere com sal.
Deixe engrossar o caldo e, quando o arroz estiver quase cozido, adicione o queijo ralado e misture.
Coloque o risoto em um refratário e cubra com queijo ralado para decorar.', NULL, NULL, 6, 416, 'almoco', TRUE);

-- 119. Salmão ao vinho tinto e uvas verdes
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('f94c92ca-6084-55bc-8a57-c653802c3a6d', 'Salmão ao vinho tinto e uvas verdes', 'Prato principal · Licopeno e polifenóis', '["2 filés de salmão de 250 g cada","2 cachos pequenos de uvas verdes","1 copo de vinho tinto","1 limão (suco)","1 colher (sopa) cheia de cebolinha bem picada","1 colher (café) de amido de milho","Manteiga","Sal a gosto","Pimenta-do-reino a gosto","Gengibre em pó a gosto"]', 'Coloque os filés temperados com sal e pimenta em uma assadeira untada com manteiga e regue com um pouco de manteiga derretida.
Leve ao forno quente por 10 minutos. Reserve.
Em uma panela, coloque o vinho, o suco de limão e a cebolinha e deixe ferver por poucos minutos em fogo baixo.
Adicione o amido de milho para engrossar o molho e umas pitadas de gengibre.
Monte os filés nos pratos, decore com os cachos de uva e regue com o molho.', NULL, NULL, 2, 328, 'almoco', TRUE);

-- 120. Salmão crocante com castanha-do-pará
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('082d80f7-e0ac-5d97-9a8f-5830673e2529', 'Salmão crocante com castanha-do-pará', 'Prato principal · Mama', '["150 g de castanha-do-pará","2 colheres (sopa) de folhas de manjericão","1 dente de alho","1 colher (sopa) de farinha de trigo","1 colher (sopa) de margarina","6 filés de salmão","Sal a gosto","Azeite"]', 'No processador, coloque as castanhas, o manjericão, o alho, a farinha, a margarina e o sal. Triture até que as castanhas fiquem em pequenos pedaços. Reserve.
Tempere os filés de salmão com sal e azeite.
Cubra todos os filés com a mistura de castanha.
Unte uma assadeira com azeite e leve ao forno preaquecido a 200 °C por aproximadamente 20 minutos.', NULL, NULL, 6, 293, 'almoco', TRUE);

-- 121. Torta de brócolis e quinoa
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('d298ae5b-d7b2-5fb5-ab0a-84b0a119fa1a', 'Torta de brócolis e quinoa', 'Prato principal · Mama', '["Massa: 1 1/2 xícara (chá) de farinha de quinoa","Massa: 3 colheres (sopa) de margarina","Massa: 1 colher (café) de sal","Massa: 5 colheres (sopa) de água gelada","Recheio: 250 g de tofu","Recheio: 1 ovo","Recheio: 1 maço de brócolis cozido","Recheio: 1 cebola pequena picada","Recheio: 1 colher (chá) de orégano","Recheio: sal a gosto"]', 'Massa: misture a farinha de quinoa, a margarina e o sal. Adicione a água aos poucos e sove.
Quando a massa estiver uniforme, faça uma bola e leve à geladeira por cerca de 30 minutos.
Use metade da massa para forrar o fundo e as laterais de uma assadeira untada.
Recheio: bata no liquidificador o tofu, o ovo, o brócolis, a cebola, o orégano e o sal.
Distribua o recheio e cubra com o restante da massa.
Leve ao forno preaquecido a 180 °C até dourar.', NULL, NULL, 4, 167, 'almoco', TRUE);

-- 122. Farinha sem glúten (mix)
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('fea9c1c7-0d3c-57cb-9e64-77859eb82945', 'Farinha sem glúten (mix)', 'Prato principal · Preparações sem glúten', '["3 xícaras (chá) de farinha de arroz","1 xícara (chá) de fécula de batata","1/2 xícara (chá) de polvilho doce"]', 'Misture bem e guarde em recipiente bem fechado.', NULL, NULL, NULL, NULL, NULL, TRUE);

-- 123. Nhoque sem glúten
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('38b8753f-6e5d-5064-a4f6-28896888bc16', 'Nhoque sem glúten', 'Prato principal · Preparações sem glúten', '["1 kg de batata cozida","1 xícara (chá) de creme de arroz","3/4 de xícara (chá) de fécula de batata","1/4 de xícara (chá) de amido de milho","1 colher (sopa) de manteiga","2 ovos","Sal a gosto"]', 'Cozinhe a batata e passe no espremedor.
Coloque todos os ingredientes em um recipiente e amasse com as mãos até que a massa fique lisa.
Corte a massa no formato de nhoque e cozinhe.
Cubra com o molho de sua preferência.', NULL, NULL, NULL, NULL, 'almoco', TRUE);

-- 124. Pão de batata sem glúten
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('6f42de71-24ef-5f23-a075-45e27a4eb172', 'Pão de batata sem glúten', 'Prato principal · Preparações sem glúten', '["3 batatas médias","5 xícaras (chá) de polvilho azedo","5 xícaras (chá) de polvilho doce","1 xícara (chá) de óleo","1 1/2 xícara (chá) de água","1 colher (café) de sal"]', 'Cozinhe as batatas e amasse em seguida, formando um purê.
Misture todos os ingredientes até obter uma massa homogênea.
Faça bolinhas com o auxílio de uma colher de sopa.
Coloque as bolinhas em uma assadeira e leve ao forno preaquecido alto (250 °C) por 45 minutos.', NULL, NULL, NULL, NULL, 'lanche', TRUE);

-- 125. Pizza de arroz cozido sabor atum com cebola
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('2d7d564b-b58b-53d4-a167-590d80bb1734', 'Pizza de arroz cozido sabor atum com cebola', 'Prato principal · Preparações sem glúten', '["Massa: 2 1/2 xícaras (chá) de arroz cozido","Massa: 2 1/2 xícaras (chá) de leite","Massa: 1/2 cebola","Massa: 1 xícara (chá) de amido de milho","Massa: 1/2 xícara (chá) de óleo","Massa: 1 ovo","Massa: 1 colher (café) de fermento em pó","Recheio: 1 lata de molho de tomate","Recheio: 1 lata de atum","Recheio: 1 cebola em tiras"]', 'Bata todos os ingredientes da massa no liquidificador.
Coloque em uma forma grande, deixando a massa fininha, e leve para assar.
Quando a massa estiver no ponto, coloque o recheio e leve ao forno novamente.', 'O recheio pode ser trocado de acordo com sua preferência.', NULL, NULL, NULL, 'jantar', TRUE);

-- 126. Purê de batatas cremoso com espinafre e castanha-do-pará
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('6cb97df6-564e-587c-ba74-902229863362', 'Purê de batatas cremoso com espinafre e castanha-do-pará', 'Prato principal · Próstata', '["1 kg de batata sem casca cozida e espremida","300 ml de leite desnatado","150 g de requeijão light","200 g de espinafre cozido e picado","1 colher (sopa) de margarina light","100 g de castanha-do-pará picada","Sal a gosto"]', 'Leve ao fogo as batatas ainda quentes, acrescentando o leite, o requeijão, o sal e o espinafre.
Mexa bem até formar um purê cremoso.
Acrescente a margarina e as castanhas e misture. Sirva a seguir.', NULL, NULL, 6, 206, 'almoco', TRUE);

-- 127. Salmão grelhado com purê de brócolis
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('a80f1579-c055-5b27-a62a-850185b38b27', 'Salmão grelhado com purê de brócolis', 'Prato principal · Próstata', '["Purê: 3 batatas pequenas","Purê: 2 xícaras (chá) de brócolis em buquês pequenos","Purê: 1 colher (sopa) de margarina","Purê: 1 xícara (chá) de leite","Purê: sal a gosto","Salmão: 500 g de filé de salmão","Salmão: 1 colher (sopa) de suco de limão","Salmão: 1 colher (sopa) de azeite","Salmão: 1 colher (sopa) de margarina","Salmão: 1 cebola picada","Salmão: 1 xícara (chá) de tomate picado","Salmão: 1/2 xícara (chá) de champignon picado","Salmão: 1 colher (sopa) de salsa picada","Salmão: sal a gosto"]', 'Purê: cozinhe as batatas por cerca de 20 minutos. Junte o brócolis e cozinhe até ficar macio.
Escorra e bata os vegetais no liquidificador. Volte para a panela, adicione a margarina, o leite e o sal e misture até obter um purê homogêneo. Reserve.
Salmão: tempere os filés com o limão e o sal e grelhe com azeite até ficarem dourados. Reserve.
Na mesma frigideira, adicione a margarina, a cebola, o tomate e o champignon e refogue até o tomate murchar. Polvilhe a salsa e retire do fogo.
Em um prato, coloque o purê, o salmão e decore com o refogado de tomate e champignon.', NULL, NULL, 6, 292, 'almoco', TRUE);

-- 128. Hambúrguer de peixe
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('95a0817d-cbb7-5f91-8e54-dbba40814d95', 'Hambúrguer de peixe', 'Prato principal · Próstata / Mama', '["4 filés de peixe","1 cebola média picada","2 dentes de alho picados","2 colheres (sopa) de salsinha picada","4 colheres (sopa) de farinha de trigo","Sal a gosto","Óleo para untar"]', 'Corte o peixe em pequenos pedaços e adicione a cebola, o alho, a salsinha, a farinha e o sal.
Misture bem até formar uma massa homogênea.
Modele a massa em forma de hambúrguer.
Unte uma frigideira e grelhe os hambúrgueres.', NULL, NULL, 4, 163, 'almoco', TRUE);

-- 129. Panquecas com recheio de brócolis e cottage
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('ba18742a-9c01-5ddb-9455-f56f54e85c72', 'Panquecas com recheio de brócolis e cottage', 'Prato principal · Próstata / Mama', '["Massa: 1 ovo","Massa: 1 xícara (chá) de leite desnatado","Massa: 1 colher (chá) de fermento químico em pó","Massa: 1 xícara (chá) de farinha de trigo","Massa: 1 colher (chá) de sal","Massa: 1 colher (sobremesa) de óleo para untar a frigideira","Recheio: 1 maço de brócolis","Recheio: 500 g de queijo cottage","Recheio: sal e pimenta a gosto"]', 'Massa: no liquidificador, bata o ovo, a farinha, o leite, o fermento e o sal até obter uma massa homogênea.
Unte uma frigideira com óleo, coloque uma concha média da massa, deixe cozinhar e vire para cozinhar do outro lado. Reserve.
Recheio: cozinhe o brócolis, pique e misture com o cottage. Tempere com sal e pimenta.
Coloque o recheio sobre as massas e enrole.', 'Utilize também os talos do brócolis. Pode ser servido com molho de tomate.', NULL, 6, 191, 'jantar', TRUE);

-- 130. Filé de frango ao molho de laranja
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('4293e99f-83f5-5c7d-9b85-d86c60a92aef', 'Filé de frango ao molho de laranja', 'Prato principal · Pulmão', '["1 kg de filé de frango","4 dentes de alho picados","Sal e pimenta a gosto","Azeite","Molho: 1 xícara (chá) de cebola picada","Molho: 2 xícaras (chá) de suco de laranja","Molho: 2 colheres (sopa) de amido de milho","Molho: sal a gosto","Molho: cebolinha picada para decorar","Molho: azeite"]', 'Tempere os filés com o alho, o sal e a pimenta e deixe descansar por aproximadamente 30 minutos.
Aqueça o azeite em uma frigideira e grelhe os filés. Reserve.
Molho: na mesma frigideira, aqueça o azeite e refogue a cebola em fogo baixo.
Reserve 1/2 xícara (chá) do suco de laranja e dissolva nele o amido.
Quando a cebola estiver dourada, acrescente o restante do suco e deixe levantar fervura. Em seguida, acrescente o suco com amido e mexa até engrossar um pouco. Tempere com sal.
Arrume os filés em um refratário, despeje o molho bem quente por cima, salpique a cebolinha e sirva em seguida.', NULL, NULL, 8, 178, 'almoco', TRUE);

-- 131. Suflê de abóbora
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('1940351a-7bc6-5cb9-a4c6-aa3131ba8638', 'Suflê de abóbora', 'Prato principal · Pulmão', '["1 colher (sopa) de cebola picada","1 dente de alho espremido","1 colher (sopa) de azeite","1 xícara (chá) de purê de abóbora","2 claras em neve","Sal a gosto"]', 'Refogue a cebola e o alho no azeite.
Acrescente o purê de abóbora e o sal e misture bem. Deixe esfriar.
Junte delicadamente as claras em neve ao purê.
Coloque em uma assadeira e asse em forno preaquecido a 180 °C até dourar. Sirva em seguida.', NULL, NULL, 3, 126, 'almoco', TRUE);

-- 132. Cuscuz de frango
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('1138c754-c7d5-5b7b-a291-c51665bc7b92', 'Cuscuz de frango', 'Prato principal · Quimioterapia e radioterapia', '["6 xícaras (chá) de farinha de milho","1/2 xícara (chá) de farinha de mandioca","1/2 xícara (chá) de óleo (e mais para untar)","1 cebola média picada","1 dente de alho picado","1 1/2 xícara (chá) de molho de tomate","3 xícaras (chá) de água","300 g de ervilha","1 vidro de palmito picado","1/2 xícara (chá) de azeitonas verdes picadas","300 g de frango cozido em cubos pequenos","Salsinha, cebolinha e sal a gosto"]', 'Misture as farinhas em um recipiente e reserve.
Em uma panela, refogue o alho e a cebola no óleo e acrescente o molho de tomate, a água, a ervilha, o palmito, a azeitona, o frango, a salsinha, a cebolinha e o sal.
Assim que ferver, acrescente as farinhas aos poucos, mexendo sempre até engrossar e soltar do fundo da panela.
Unte com óleo o fundo e as laterais de uma forma grande de pudim e coloque o cuscuz.
Espere esfriar e desenforme. Sirva frio ou morno.', 'Indicações: dor para engolir e feridas na boca.', NULL, 12, 163, 'almoco', TRUE);

-- 133. Risoto de arroz 7 grãos
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('0704d57c-f785-5fa1-bad5-0c12d31ef2e5', 'Risoto de arroz 7 grãos', 'Prato principal · Quimioterapia e radioterapia', '["1 colher (sopa) de óleo","1/2 cebola média picada","200 g de cenoura em cubos","200 g de ervilha","1 pimentão vermelho em cubos","500 ml de caldo de legumes","200 g de arroz 7 grãos cozido","2 colheres (sopa) de requeijão","Sal, manjericão e salsinha a gosto"]', 'Em uma panela, refogue a cebola no óleo até ficar levemente dourada.
Acrescente a cenoura, a ervilha e o pimentão.
Acrescente metade do caldo e deixe ferver.
Junte o arroz 7 grãos e misture. Coloque o requeijão e mexa bem.
Se necessário, acrescente o caldo aos poucos até ficar bem cremoso.
Por último, coloque o sal, o manjericão e a salsinha. Sirva em seguida.', 'Indicações: obstipação (intestino preso).', NULL, 5, 279, 'almoco', TRUE);

-- 134. Purê de abóbora com suplemento
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('f9e7d4a0-e2e4-5454-a68e-c93b19dcac1f', 'Purê de abóbora com suplemento', 'Prato principal · Receitas hipercalóricas', '["100 g de abóbora japonesa","100 g de batata","60 ml de suplemento nutricional à base de lipídeos sem sabor (emulsão de lipídeos)","Salsa a gosto","Sal a gosto"]', 'Cozinhe a abóbora e a batata até que fiquem macias.
Em um recipiente, amasse os legumes e misture bem.
Acrescente o suplemento nutricional, o sal e a salsa. Sirva a seguir.', NULL, NULL, 1, 348, 'almoco', TRUE);

-- 135. Escondidinho de mandioquinha e carne moída
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('63e2e54b-61fe-5c60-81a7-c80046ae8afc', 'Escondidinho de mandioquinha e carne moída', 'Prato principal · Receitas obstipantes', '["2 mandioquinhas cozidas","1 colher (sopa) de cebola picada","1 colher (sopa) de azeite de oliva","100 g de carne moída","2 azeitonas picadas","6 colheres (sopa) de suplemento nutricional em pó sem sabor","Sal a gosto"]', 'Amasse a mandioquinha cozida até formar um purê e acrescente o suplemento nutricional. Misture bem e reserve.
Para o recheio, doure a cebola no azeite, adicione a carne moída, as azeitonas e o sal e refogue.
Em um refratário, coloque uma camada de purê, espalhe o recheio e finalize com o restante do purê.
Sirva a seguir.', NULL, NULL, 1, 608, 'almoco', TRUE);

-- 136. Risoto de frango
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('953fbd6d-8267-579d-985a-27f80d445f52', 'Risoto de frango', 'Prato principal · Receitas obstipantes', '["1/2 colher (sopa) de margarina","1/2 colher (sopa) de azeite de oliva","1 colher (sopa) de cebola picada","1/2 dente de alho picado","1 xícara (chá) de arroz arbóreo","100 g de peito de frango em tiras","1/2 L de caldo de legumes","1 colher (sopa) de champignon","50 g de queijo branco em cubos","6 colheres (sopa) de suplemento nutricional em pó sem sabor","Sal a gosto"]', 'Em uma panela, refogue em fogo baixo por 2 minutos a margarina, o azeite, a cebola e o alho.
Adicione o arroz e mexa em fogo médio até que os grãos fiquem transparentes. Acrescente o frango.
Coloque o caldo de legumes aos poucos, mexendo sempre, até que o caldo quase seque e o arroz fique cremoso.
Acrescente o champignon, o queijo branco e o sal.
Desligue o fogo e acrescente o suplemento nutricional. Sirva a seguir.', NULL, NULL, 2, 323, 'almoco', TRUE);

-- 137. Bolo de repolho
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('db998bcd-9a78-56d4-b114-60a9f065b405', 'Bolo de repolho', 'Prato principal · Receitas saborosas com soja', '["3 colheres (sopa) de azeite","10 azeitonas","1 maço de cheiro-verde","1 cebola","7 colheres (sopa) de farinha de trigo","1 colher (chá) de fermento em pó","3 ovos","1 pacote pequeno de queijo ralado","1 pimentão","3 tomates","1 repolho","1 vidro de leite de coco","Sal a gosto"]', 'Corte o repolho bem fininho e cozinhe com água e sal. Escorra e enxugue com um pano.
Refogue no azeite os tomates picados, o pimentão, a cebola e o cheiro-verde. Coloque o repolho e mexa.
Tire do fogo e junte a farinha, os ovos ligeiramente batidos, o fermento, o leite de coco, o queijo ralado e as azeitonas. Prove o sal e mexa bem.
Coloque em uma forma com furo no meio, untada e enfarinhada.
Leve ao forno médio por cerca de 35 minutos.', NULL, NULL, 14, 169, 'lanche', TRUE);

-- 138. Bolo de soja
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('b61aaf1d-e60b-5a8b-959f-b82ab7101e54', 'Bolo de soja', 'Prato principal · Receitas saborosas com soja', '["3 colheres (sopa) de margarina","2 copos de açúcar","3 ovos (claras e gemas separadas)","1 1/2 copo de leite de soja","2 1/2 copos de farinha de trigo","1/2 copo de amido de milho","1/2 copo de resíduo de soja (extraído do leite de soja)","1 colher (sopa) de fermento em pó","Raspas de limão"]', 'Bata as claras em neve e reserve.
Bata a margarina, o açúcar e as gemas.
Acrescente os outros ingredientes e, por último, as claras.
Leve para assar em forma untada e polvilhada.', NULL, NULL, NULL, 144, 'lanche', TRUE);

-- 139. Feijoada vegetariana
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('8252b4d3-eb56-5a8c-8242-c618424ca7cc', 'Feijoada vegetariana', 'Prato principal · Receitas saborosas com soja', '["2 kg de feijão-preto","500 g de proteína texturizada de soja (PTS) em pedaços","300 g de glúten","250 g de ricota defumada com pimenta","8 folhas de louro","1,7 kg de berinjela","1,2 kg de chuchu","2 maços de rabanete","1 nabo pequeno","400 g de alho","250 ml de shoyu","Limão para temperar","Sal a gosto","Orégano","Óleo para fritar"]', 'Deixe o feijão de molho. Hidrate a proteína de soja em água fria ou morna e, depois de hidratada, aperte com as mãos para retirar a água. Reserve.
Numa bacia, misture o glúten com água e mexa rapidamente até formar uma massa homogênea.
Divida a massa em pedaços pequenos e cozinhe em panela de pressão com 2 litros de água e o shoyu, em fogo baixo, por aproximadamente 30 minutos.
Tempere a proteína e o glúten com limão, alho, sal e orégano e frite em óleo quente. Reserve.
Em uma panela de pressão grande, coloque o feijão, a proteína, o glúten, a ricota defumada e o louro com água suficiente e cozinhe por aproximadamente 40 minutos.
Destampe a panela e acrescente a berinjela, o chuchu, o nabo e o rabanete picados bem pequenos, com água suficiente para cozinhar até engrossar bem.
Depois de cozido, tempere com alho frito e sal à vontade.', NULL, NULL, 40, 215, 'almoco', TRUE);

-- 140. Hambúrguer saudável de inhame e soja
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('4e021d11-484f-5e48-a595-d5829d2fb4ac', 'Hambúrguer saudável de inhame e soja', 'Prato principal · Receitas saborosas com soja', '["1 kg de inhame cozido e amassado","60 g de proteína de soja hidratada em 1 L de caldo de legumes","300 ml de molho de soja (shoyu)","2 colheres (sopa) de gengibre ralado","1 maço de salsinha picada","1 couve-flor ralada e refogada","4 alhos-porós picados e refogados","6 dentes de alho batidos com 200 ml de azeite","1/2 maço de manjericão picado","3 ovos","2 copos de arroz integral cozido","3 xícaras (chá) de farinha de rosca","Sal e pimenta-do-reino a gosto"]', 'Misture o inhame, a soja, o shoyu, o gengibre, a salsa, a couve-flor, o alho-poró, o alho, o manjericão e os ovos até formar uma massa homogênea e passe no mixer, transformando em uma pasta.
Adicione o arroz, a farinha de rosca, o sal e a pimenta, batendo sempre, até a pasta ficar firme.
Modele bolinhas e achate no formato de hambúrguer.
Leve ao congelador e, quando estiverem congelados, coloque em uma assadeira untada e asse até dourar por inteiro.', NULL, NULL, 8, 235, 'almoco', TRUE);

-- 141. Arroz com ervas
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('ab788236-ed47-5ff8-a08e-8b3df41a0236', 'Arroz com ervas', 'Prato principal · Refeições mais saborosas', '["200 g de arroz cru","1 dente de alho","1 colher (café) de sal","1 colher (sopa) de manjericão fresco","1 colher (chá) de alecrim seco","1 colher (chá) cheia de açafrão em pó","1 colher (sopa) de semente de linhaça","1 colher (chá) cheia de óleo de canola","Água"]', 'Refogue o alho com o óleo e o sal.
Quando estiver dourado, acrescente o arroz, adicione água e os outros temperos.
Espere o arroz cozinhar.', NULL, NULL, 3, 249, 'almoco', TRUE);

-- 142. Arroz com frango ao curry
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('92f86877-3dfb-5130-ba21-a4ed2c3d5c07', 'Arroz com frango ao curry', 'Prato principal · Refeições mais saborosas', '["200 g de arroz integral","1 dente de alho","1 colher (café) de sal","1 colher (chá) cheia de óleo de canola","3 peitos de frango em cubos","1/2 colher (café) de curry em pó","1/3 de xícara (chá) de uvas-passas","1/3 de xícara (chá) de castanhas-de-caju torradas","1 colher (sopa) de margarina light","Água"]', 'Refogue o alho com o óleo e o sal.
Quando estiver dourado, acrescente o arroz, adicione água e o curry e aguarde o arroz cozinhar.
Em outra panela, refogue o frango em cubos com a margarina e acrescente as uvas-passas e as castanhas-de-caju.
Para finalizar, junte o arroz ao refogado e sirva em seguida.', NULL, NULL, 4, 352, 'almoco', TRUE);

-- 143. Cenoura aos três aromas
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('07fa0cdb-bcd8-514b-8f49-327732a0879a', 'Cenoura aos três aromas', 'Prato principal · Refeições mais saborosas', '["800 g de cenoura sem casca","1 colher (sopa) de óleo de canola","2 colheres (sopa) de azeite de oliva","2 dentes de alho picados","2 colheres (chá) de orégano fresco picado","2 colheres (chá) de salsinha picada","3 colheres (chá) de vinho rosé","Pimenta-branca moída na hora"]', 'Corte as cenouras em rodelas de cerca de 0,5 cm na diagonal.
Afervente em água por 3 a 4 minutos. Retire do fogo, esfrie em água corrente e escorra bem.
Em uma frigideira grande, aqueça o óleo, o azeite, o alho e a cenoura e refogue em fogo médio por cerca de 5 minutos, sem deixar o alho queimar.
Acrescente o vinho e cozinhe em fogo alto até evaporar e caramelizar.
Acrescente o orégano e a salsinha, salpique pimenta-branca e sirva em seguida.', NULL, NULL, 6, 86, 'almoco', TRUE);

-- 144. Panqueca de soja
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('60ad4a39-cacb-5142-bccd-f2585566975e', 'Panqueca de soja', 'Prato principal · Refeições mais saborosas', '["Massa: 1 ovo","Massa: 1/2 xícara (chá) de leite de soja","Massa: 1 xícara (chá) de farinha de trigo","Massa: 2 colheres (sopa) de óleo","Massa: 1 pitada de sal","Recheio: 1 1/2 xícara (chá) de PTS (proteína de soja texturizada)","Recheio: 1 1/2 tablete de caldo de legumes","Recheio: 1 1/2 xícara (chá) de água","Recheio: 1 cenoura ralada","Recheio: 2 cebolas picadas","Recheio: 6 dentes de alho","Recheio: 1 colher (sopa) de salsinha","Recheio: 1 colher (sopa) de manjericão","Recheio: 2 colheres (sopa) de azeite","Recheio: azeitonas a gosto","Molho de tomate para servir"]', 'Massa: bata todos os ingredientes no liquidificador.
Unte a frigideira e aqueça. Coloque uma pequena porção de massa e espalhe por todo o fundo, deixando bem fina. Doure dos dois lados e retire.
Recheio: aqueça a água e dissolva os tabletes de caldo de legumes. Coloque a PTS e deixe de molho por 15 minutos.
Doure a cebola e o alho no azeite e acrescente a PTS, a cenoura, as azeitonas, a salsinha e o manjericão.
Recheie os discos e sirva com molho de tomate.', NULL, NULL, 6, 198, 'jantar', TRUE);

-- 145. Frango crocante recheado
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('c0a03975-8fdc-57cf-8fdc-fa8b4c97aaf7', 'Frango crocante recheado', 'Prato principal · Tumores abdominais', '["500 g de filé de frango","300 ml de suco de laranja","2 dentes de alho espremidos","1 cebola em fatias finas","2 colheres (sopa) de cebolinha","200 ml de creme de leite light","2 colheres (sopa) de azeite","200 g de avelã, nozes ou castanha-do-pará trituradas","1 1/2 cenoura em cubos","100 g de vagem cortada","Sal e pimenta a gosto"]', 'Tempere os filés de frango com o suco de laranja, o alho, o sal e a pimenta e deixe marinar por 15 minutos.
Unte um refratário com azeite e cubra o fundo com a cebola, a cebolinha e 100 ml de creme de leite. Reserve.
Pincele os filés com azeite e recheie com a cenoura e a vagem. Enrole e prenda com dois palitos.
Pincele os filés com o restante do creme de leite e polvilhe as castanhas trituradas.
Coloque no refratário e leve ao forno por 40 minutos.', NULL, NULL, 5, 227, 'almoco', TRUE);

-- 146. Nhoque de abóbora ao sugo
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('e91ea6c8-0ada-53bc-8970-ecc2593d8b72', 'Nhoque de abóbora ao sugo', 'Prato principal · Tumores abdominais', '["Nhoque: 1,5 kg de abóbora sem casca em pedaços","Nhoque: 500 g de ricota","Nhoque: 2 xícaras (chá) de farinha de trigo integral","Nhoque: 1 colher (chá) de sal","Nhoque: água para cozimento","Molho: 500 g de tomates sem pele e sem sementes","Molho: 1 colher (sopa) de azeite","Molho: 1 cebola picada","Molho: 1 dente de alho","Molho: 1 colher (chá) de orégano","Molho: 1 colher (chá) de sal"]', 'Nhoque: cozinhe a abóbora até ficar macia, escorra e amasse.
Em um recipiente, misture a abóbora, a ricota, a farinha e o sal até obter uma massa homogênea.
Enrole a massa em tiras e corte em pequenos pedaços.
Aqueça a água e, quando ferver, cozinhe os nhoques. Quando subirem, retire e coloque em um refratário.
Molho: bata os tomates no liquidificador e reserve. Doure a cebola e o alho no azeite, acrescente os tomates, o sal e o orégano e cozinhe por 20 minutos em fogo baixo.
Despeje o molho sobre os nhoques e sirva a seguir.', NULL, NULL, 8, 251, 'almoco', TRUE);

-- 147. Frozen de morango com aveia
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('5e1fcddf-7bc2-5470-b51b-64138248b6d4', 'Frozen de morango com aveia', 'Sobremesa · Alimentos funcionais', '["2 copos de iogurte natural desnatado","15 morangos","1/2 xícara (chá) de aveia em flocos","Açúcar a gosto"]', 'Leve os iogurtes e os morangos ao freezer por cerca de 4 horas para congelar.
Bata no liquidificador com o açúcar até formar um creme homogêneo e consistente.
Acrescente a aveia, mexa bem e sirva em seguida.', NULL, NULL, 3, 116, 'lanche', TRUE);

-- 148. Sagu de chia
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('ff08d352-5d1e-586d-ad5d-856eead19204', 'Sagu de chia', 'Sobremesa · Alimentos funcionais', '["3 colheres (sopa) de chia","300 ml de suco de uva integral","3 cravos-da-índia","2 pedaços de canela em pau"]', 'Em um recipiente, coloque todos os ingredientes e misture bem.
Cubra com filme plástico e leve à geladeira por 2 horas.', NULL, NULL, 3, 177, 'lanche', TRUE);

-- 149. Bolo de feijão
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('c6850970-e91a-5c7e-b1fd-2c3d3c3bc4f3', 'Bolo de feijão', 'Sobremesa · Anemia', '["Massa: 4 ovos","Massa: 1 xícara (chá) de feijão-preto cozido sem tempero","Massa: 1/2 xícara (chá) de caldo de feijão","Massa: 1 colher (sopa) de essência de baunilha","Massa: 2 xícaras (chá) de açúcar","Massa: 1 xícara (chá) de farinha de trigo","Massa: 1 xícara (chá) de farinha de rosca","Massa: 1/2 xícara (chá) de óleo","Massa: 1 colher (sopa) de fermento em pó","Cobertura: 6 colheres (sopa) de açúcar","Cobertura: 6 colheres (sopa) de chocolate em pó","Cobertura: 2 colheres (sopa) de margarina sem sal"]', 'Massa: separe as claras das gemas. Bata as claras em neve e reserve.
Bata no liquidificador o feijão, o caldo, o óleo e a baunilha.
Na batedeira, bata o açúcar e as gemas até obter um creme claro. Acrescente as farinhas, o fermento e a mistura do liquidificador e bata bem.
Incorpore delicadamente a massa às claras em neve.
Coloque em uma forma untada e enfarinhada e asse em forno médio.
Cobertura: misture todos os ingredientes e leve ao fogo até engrossar um pouco.
Desenforme o bolo e coloque a cobertura.', NULL, NULL, 16, 193, 'lanche', TRUE);

-- 150. Espumone de laranja com calda de mel e gengibre
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('f1a53922-7cac-5f69-b28b-c38371079de5', 'Espumone de laranja com calda de mel e gengibre', 'Sobremesa · Anemia', '["4 envelopes de gelatina em pó sem sabor","4 xícaras (chá) de suco de laranja","1 1/2 xícara (chá) de açúcar","4 laranjas em cubos","Calda: 1/2 xícara (chá) de mel","Calda: 1 colher (chá) de gengibre ralado"]', 'Dissolva a gelatina conforme a embalagem.
No liquidificador, bata a gelatina, o suco de laranja e o açúcar.
Descasque as laranjas, retire o miolo, corte em cubinhos e coloque em taças.
Cubra com a mistura e leve à geladeira.
Para a calda, misture o mel com o gengibre ralado e cubra o espumone. Sirva a seguir.', NULL, NULL, 6, 234, 'lanche', TRUE);

-- 151. Bolo de casca de mamão
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('e612dfc1-9ad2-591e-951e-028caebe7c33', 'Bolo de casca de mamão', 'Sobremesa · Aproveitamento integral dos alimentos', '["2 ovos","1 colher (sopa) de fermento em pó","2 xícaras (chá) de farinha de trigo","2 xícaras (chá) de açúcar","2 xícaras (chá) de caldo de casca de mamão (1 delas adoçada)"]', 'Descasque um mamão maduro e leve as cascas ao fogo em uma panela com água. Deixe ferver e, depois de frio, bata no liquidificador. Reserve.
Bata as claras em neve, misture as gemas e continue batendo.
Junte aos poucos o açúcar e a farinha. Acrescente 1 xícara (chá) do caldo de casca de mamão e, por último, o fermento.
Asse em forma untada, em forno moderado.
Depois de assado, vire em um prato, fure com um garfo e despeje a outra xícara do caldo de casca de mamão adoçado.', NULL, NULL, 15, 242, 'lanche', TRUE);

-- 152. Pão doce de casca de abacaxi
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('465591e4-ce12-5831-b858-c2a52dcee75d', 'Pão doce de casca de abacaxi', 'Sobremesa · Aproveitamento integral dos alimentos', '["1 xícara de suco de casca de abacaxi","1 colher (chá) de sal","4 colheres (sopa) de açúcar","1/2 kg de farinha de trigo","30 g de fermento biológico","50 g de margarina","3 gemas","1 gema para pincelar"]', 'Lave a casca do abacaxi em água corrente e ferva em uma panela com 2 copos de água por aproximadamente 20 minutos, até formar um xarope. Reserve.
Dissolva o fermento no açúcar e acrescente as 3 gemas, a margarina, o suco da casca e o sal.
Acrescente a farinha aos poucos, misturando até formar uma massa que não grude nas mãos.
Divida a massa em duas ou três partes, enrole os pães e deixe crescer até dobrar de tamanho.
Pincele com gema e asse em forno preaquecido a 200 °C por aproximadamente 40 minutos.', NULL, NULL, 120, 70, 'cafe', TRUE);

-- 153. Frozen de iogurte de acerola
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('af00f222-acf1-5de4-8e67-13669746a2e2', 'Frozen de iogurte de acerola', 'Sobremesa · Cabeça e pescoço', '["1 pote de iogurte natural","1 envelope de gelatina incolor sem sabor","500 ml de suco natural de acerola","4 colheres (sopa) de açúcar demerara"]', 'Dissolva a gelatina conforme orientação do fabricante.
Bata na batedeira todos os ingredientes até formar um creme homogêneo.
Cubra com filme plástico e leve ao congelador até as bordas começarem a cristalizar.
Bata novamente por 5 minutos e volte ao congelador até ficar firme, mas cremoso. Sirva a seguir.', NULL, NULL, 4, 87, 'lanche', TRUE);

-- 154. Gelado de frutas
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('8f55eff9-4bf5-5705-9f6b-29fbc27531e8', 'Gelado de frutas', 'Sobremesa · Cabeça e pescoço', '["Gelatina: 2 xícaras (chá) de água","Gelatina: 1/2 xícara (chá) de suco de maracujá","Gelatina: 1 xícara (chá) de açúcar","Gelatina: 1 envelope de gelatina em pó sem sabor","Gelatina: 2 rodelas de abacaxi picado","Gelatina: 1 xícara (chá) de uva rubi sem semente cortada ao meio","Gelatina: 1 xícara (chá) de manga em cubos","Creme: 1 envelope de gelatina em pó sem sabor","Creme: 250 g de ricota","Creme: 1 pote de iogurte natural desnatado","Creme: 1 lata de leite condensado"]', 'Gelatina: em uma panela, misture a água, o suco e o açúcar e leve ao fogo até ferver. Deixe esfriar.
Dilua a gelatina conforme o fabricante, adicione à mistura e acrescente as frutas.
Unte uma forma de bolo inglês, despeje a mistura e leve à geladeira por cerca de 2 horas ou até firmar.
Creme: dilua a gelatina conforme o fabricante e bata no liquidificador com a ricota, o iogurte e o leite condensado.
Despeje o creme sobre a gelatina e volte à geladeira até gelar. Desenforme antes de servir.', NULL, NULL, 6, 204, 'lanche', TRUE);

-- 155. Creme de maracujá
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('11a37105-5f4c-5f2d-bcd7-c96926b40cf7', 'Creme de maracujá', 'Sobremesa · Colorretal', '["1 1/2 copo de leite desnatado","1 xícara (chá) de polpa de maracujá","10 colheres (sopa) de cereal integral sem açúcar","1 1/2 colher (sopa) de amido de milho","200 ml de água","2 colheres (sopa) de adoçante para forno e fogão"]', 'Bata a polpa de maracujá com a água no liquidificador e coe.
Em uma panela, coloque 1 copo de leite, o maracujá batido e o adoçante.
Dissolva o amido de milho em 1/2 copo de leite, junte à mistura de maracujá e mexa em fogo baixo até engrossar.
Em um refratário pequeno, alterne camadas de cereal e creme de maracujá, terminando com cereal.
Deixe na geladeira por 2 horas.', NULL, NULL, 8, 98, 'lanche', TRUE);

-- 156. Gelatina de frutas vermelhas
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('b54474df-0665-5267-9b99-e52bb012b1f0', 'Gelatina de frutas vermelhas', 'Sobremesa · Colorretal', '["400 ml de suco de maçã","1/2 colher (chá) de canela em pó","7 envelopes de gelatina incolor sem sabor","2 xícaras (chá) de morango picado","2 xícaras (chá) de framboesa picada","1 xícara (chá) de amora picada"]', 'Em uma panela, ferva o suco com a canela. Retire do fogo e reserve.
Dissolva a gelatina conforme o fabricante e junte ao suco quente. Espere esfriar.
Em forminhas individuais umedecidas com água, distribua as frutas e cubra com o suco com gelatina.
Mantenha na geladeira por 6 horas, desenforme e decore a gosto. Sirva em seguida.', NULL, NULL, 6, 79, 'lanche', TRUE);

-- 157. Muffin de banana
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('4eaf64ae-8d40-52aa-aa25-2c56b8f193c3', 'Muffin de banana', 'Sobremesa · Colorretal', '["2 claras de ovo","100 g de margarina light","1 xícara (chá) de açúcar","2 xícaras (chá) de aveia em flocos finos","1 xícara (chá) de farinha de trigo","1 colher (chá) de gengibre ralado","3 bananas em rodelas","1 colher (sopa) de fermento químico em pó"]', 'Bata as claras em neve e reserve.
Bata o restante dos ingredientes e incorpore as claras em neve.
Coloque porções da massa em forminhas de papel.
Coloque as forminhas numa assadeira e leve ao forno médio preaquecido até assar.', NULL, NULL, 15, 121, 'lanche', TRUE);

-- 158. Torta de morango enriquecida com linhaça
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('d0634185-6e33-56e9-9f47-bb23aa002a09', 'Torta de morango enriquecida com linhaça', 'Sobremesa · Como enriquecer os alimentos', '["Massa: 2 xícaras (chá) de farinha de trigo","Massa: 3/4 de xícara (chá) de linhaça","Massa: 1 ovo inteiro","Massa: 100 g de margarina","Massa: 2 colheres (sopa) de açúcar refinado","Massa: 1 colher (sopa) de amido de milho","Recheio: 1 lata de leite condensado","Recheio: 1 xícara de leite integral ou enriquecido","Recheio: 2 gemas","Recheio: 2 colheres (sobremesa) de amido de milho","Recheio: 1 lata de creme de leite sem soro","Cobertura: 2 caixas de morangos maduros, higienizados e secos","Cobertura: 250 ml de água","Cobertura: 2 colheres (sopa) de açúcar","Cobertura: 3 folhas de gelatina vermelha sem sabor","Cobertura: 2 colheres (sopa) de água filtrada"]', 'Recheio: em uma panela, junte todos os ingredientes, menos o creme de leite, e leve ao fogo mexendo sempre até engrossar. Desligue e acrescente o creme de leite. Reserve.
Massa: em um recipiente, junte todos os ingredientes e amasse bem até obter uma massa lisa que desprenda das mãos.
Forre o fundo de uma forma de aro removível de cerca de 30 cm, deixando uma borda de 2 cm. Fure toda a massa com um garfo e asse por aproximadamente 15 minutos.
Deixe esfriar completamente e coloque o recheio, também frio.
Arrume os morangos sobre o creme, um ao lado do outro, cobrindo toda a superfície.
Gelatina: pique as folhas de gelatina e hidrate com a água filtrada. Ferva a água com o açúcar, desligue e acrescente a gelatina hidratada.
Quando a gelatina começar a gelificar, despeje sobre a torta e leve para gelar.', NULL, NULL, 10, NULL, 'lanche', TRUE);

-- 159. Arroz-doce de chocolate
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('550e24d3-9bd7-5a69-b0e0-5edaaf2c8e28', 'Arroz-doce de chocolate', 'Sobremesa · Diabetes', '["1 xícara (chá) de arroz","2 colheres (sopa) de achocolatado em pó diet","1 1/2 xícara (chá) de leite","1 suplemento nutricional para diabetes sabor chocolate (200 ml)"]', 'Em uma panela, cozinhe em fogo baixo o arroz e o leite até os grãos ficarem macios.
Retire do fogo e acrescente o achocolatado diet e o suplemento nutricional. Misture bem.
Distribua em taças e leve à geladeira por 30 minutos. Sirva a seguir.', NULL, NULL, 2, 225, 'lanche', TRUE);

-- 160. Bicamada de morango
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('a79f4033-8d74-5610-9d88-46034b482796', 'Bicamada de morango', 'Sobremesa · Diabetes', '["1/2 envelope de gelatina sem sabor","1 suplemento nutricional para diabetes sabor morango (200 ml)","2 colheres (sopa) de creme de leite","1/4 de envelope de gelatina diet sabor morango"]', 'Para o pudim, dissolva a gelatina sem sabor conforme orientação do fabricante.
Bata o suplemento, o creme de leite e a gelatina dissolvida e mantenha na geladeira até endurecer.
Prepare a gelatina de morango conforme o fabricante, deixe esfriar e despeje sobre o pudim.
Leve novamente à geladeira por 3 horas.', NULL, NULL, 2, 169, 'lanche', TRUE);

-- 161. Bolo brigadeiro diet
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('ff18f153-22f0-5a57-ba05-c258826528ca', 'Bolo brigadeiro diet', 'Sobremesa · Diabetes', '["Pão de ló: 4 ovos","Pão de ló: 3 colheres (sopa) rasas de adoçante","Pão de ló: 1 xícara (chá) de farinha de trigo","Pão de ló: 2 colheres (sopa) de manteiga derretida","Pão de ló: 2 colheres (sopa) rasas de cacau em pó","Calda: 1 xícara (chá) de água","Calda: 2 colheres (sopa) de adoçante","Recheio: 1 xícara (chá) de leite em pó desnatado","Recheio: 1 xícara (chá) de água","Recheio: 40 g de chocolate de cobertura dietético","Recheio: 1 colher (sopa) rasa de adoçante","Recheio: 1 colher (sopa) rasa de cacau"]', 'Pão de ló: bata as claras em neve e acrescente as gemas uma a uma, continuando a bater. Adicione o adoçante e o cacau.
Junte a farinha aos poucos, misturando delicadamente com uma colher de pau. Acrescente a manteiga e misture novamente.
Despeje em uma forma de fundo removível e asse a 180 °C por cerca de 20 minutos. Desenforme ainda quente e deixe esfriar sobre uma grade.
Calda: misture a água com o adoçante.
Recheio: bata o leite em pó com a água e leve ao fogo com o adoçante, o chocolate e o cacau. Cozinhe em fogo moderado, mexendo por cerca de 20 minutos, até engrossar. Deixe esfriar.
Montagem: corte o pão de ló em fatias, pincele com a calda, recheie e cubra com o creme.', NULL, NULL, NULL, 122, 'lanche', TRUE);

-- 162. Bolo de abacaxi com castanha-de-caju
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('7422a4a2-1f50-5482-8aa4-913e2877ecdd', 'Bolo de abacaxi com castanha-de-caju', 'Sobremesa · Diabetes', '["3 xícaras (chá) de abacaxi em cubos","4 claras em neve","4 gemas","1/2 xícara (chá) de adoçante em pó próprio para forno e fogão","1/4 de xícara (chá) de óleo de canola","1 xícara (chá) de farinha de trigo integral","1 xícara (chá) de farinha de trigo","50 g de castanha-de-caju picada","1 colher (sopa) de fermento em pó","Margarina e farinha para untar"]', 'Coloque o abacaxi e o adoçante em uma panela e leve ao fogo até amolecer e formar uma calda. Reserve.
Na batedeira, misture as gemas e o óleo e acrescente alternadamente o abacaxi e as duas farinhas.
Retire da batedeira e adicione a castanha-de-caju, as claras em neve e o fermento.
Coloque em uma forma untada com margarina e enfarinhada.
Asse em forno médio preaquecido por cerca de 40 minutos.', NULL, NULL, 12, 177, 'lanche', TRUE);

-- 163. Cheesecake de goiaba diet
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('eab5d819-bff4-5834-b339-0971d72c5708', 'Cheesecake de goiaba diet', 'Sobremesa · Diabetes', '["Massa: 2 xícaras (chá) de farinha de trigo","Massa: 1 colher (sopa) rasa de adoçante stevia","Massa: 1/2 xícara (chá) de margarina light","Massa: 1 ovo","Massa: 1 colher (café) de sal","Recheio: 2 gemas","Recheio: 2 colheres (sopa) de amido de milho","Recheio: 200 g de requeijão cremoso light","Recheio: 1 embalagem de creme de leite light (200 g)","Recheio: 1 lata de leite condensado diet","Recheio: 2 claras em neve","Cobertura: 200 g de goiabada diet picada","Cobertura: 1/2 xícara (chá) de água"]', 'Massa: misture todos os ingredientes, acrescentando farinha até a massa desgrudar das mãos. Reserve.
Recheio: bata as claras em neve e reserve.
Em uma vasilha, misture o leite condensado, o requeijão, as gemas peneiradas, o amido e o creme de leite. Acrescente as claras em neve e mexa delicadamente até ficar homogêneo.
Forre o fundo e a lateral de uma forma de 24 cm com a massa e faça furos com um garfo para não criar bolhas.
Recheie, cubra com papel-alumínio e asse em forno preaquecido por 40 minutos. Retire o papel e deixe por mais 10 minutos. Deixe esfriar.
Cobertura: leve a goiabada e a água ao fogo baixo, mexendo sempre até derreter. Deixe esfriar, cubra a torta e leve para gelar.', NULL, NULL, NULL, 156, 'lanche', TRUE);

-- 164. Creme de papaia
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('c885c193-2073-53f6-a8d3-f093d8e2e9e8', 'Creme de papaia', 'Sobremesa · Diabetes', '["1 1/2 mamão papaia","1 suplemento nutricional para diabetes sabor baunilha (200 ml)","2 colheres (sopa) de geleia de amora diet"]', 'Deixe o mamão e o suplemento no congelador por 30 minutos.
No liquidificador, bata o mamão e o suplemento até formar um creme.
Distribua em taças e decore com a geleia.', NULL, NULL, 2, 184, 'lanche', TRUE);

-- 165. Docinho de batata-doce
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('94994c1b-cc77-5556-905e-af59cb92a045', 'Docinho de batata-doce', 'Sobremesa · Diabetes', '["3 batatas-doces médias","1/2 xícara (chá) de leite","1 colher (sobremesa) de adoçante para forno e fogão"]', 'Descasque as batatas, coloque em uma panela com água fria e leve ao fogo médio, com a panela semitampada, até amolecer.
Escorra e amasse ainda quentes.
Em uma panela, coloque a massa de batata-doce, o adoçante e o leite e leve ao fogo brando, mexendo sempre até soltar do fundo.
Coloque em um prato fundo e espere esfriar.
Com o auxílio de uma colher de sobremesa, faça as bolinhas.', NULL, NULL, NULL, 35, 'lanche', TRUE);

-- 166. Flan de kiwi
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('a861902c-a95d-59bd-9b54-979ac956cf0d', 'Flan de kiwi', 'Sobremesa · Diabetes', '["2 potes de iogurte desnatado","4 kiwis","1 envelope de gelatina diet em pó sabor limão","1 xícara (chá) de água","1 xícara (chá) de leite desnatado","1/2 limão (suco)","Fatias de kiwi para decorar"]', 'Prepare a gelatina com a xícara de água.
No liquidificador, bata o iogurte, o kiwi, a gelatina preparada, o leite e o suco de limão.
Coloque em taças e leve para gelar até endurecer.
Decore com fatias de kiwi.', NULL, NULL, NULL, 57, 'lanche', TRUE);

-- 167. Mousse de chocolate com suplemento
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('637b865c-a841-599d-aa5e-fe7ba24e9ebc', 'Mousse de chocolate com suplemento', 'Sobremesa · Diabetes', '["1/2 envelope de gelatina sem sabor","1 suplemento nutricional para diabetes sabor chocolate (200 ml)","2 colheres (sopa) de creme de leite","2 colheres (sopa) de achocolatado diet"]', 'Dissolva a gelatina conforme orientação do fabricante.
Bata no liquidificador o suplemento, o creme de leite, o achocolatado e a gelatina.
Deixe na geladeira por 3 horas.', NULL, NULL, 2, 201, 'lanche', TRUE);

-- 168. Picolé de yacon
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('7ac684ac-e0ef-5c61-b494-03e76a319f03', 'Picolé de yacon', 'Sobremesa · Diabetes', '["Doce: 500 g de batata yacon","Doce: 8 colheres (sopa) de adoçante de uso culinário","Doce: 1 L de água","Doce: 1 limão (suco)","Picolé: 1 1/2 pacote de coco ralado sem açúcar","Picolé: 1 colher (sopa) de leite em pó desnatado","Picolé: 1/2 L de leite desnatado","Picolé: 5 colheres (sopa) de adoçante de uso culinário","Picolé: 1 colher (sopa) rasa de gelatina incolor"]', 'Higienize as batatas, corte em rodelas e deixe imersas em água com suco de limão por 15 minutos (1 colher de suco para 1 litro de água).
Doce: corte as batatas em cubinhos e cozinhe com o adoçante até o caldo virar uma calda fina. Separe metade do doce para o picolé.
Picolé: hidrate o coco ralado por 30 minutos (mesma quantidade de água e de coco).
Bata no liquidificador por 5 minutos o leite em pó, o leite desnatado, o adoçante, o coco e metade do doce de yacon.
Adicione a gelatina dissolvida em água morna e bata mais um pouco.
Preencha as forminhas de picolé até a metade com a outra porção do doce de yacon e complete com a mistura batida.
Deixe congelar por 24 horas.', NULL, NULL, 12, 35, 'lanche', TRUE);

-- 169. Pudim de claras com calda de ameixa
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('c891c138-39bc-54a7-9058-dfefb2eb1fc3', 'Pudim de claras com calda de ameixa', 'Sobremesa · Diabetes', '["8 claras em temperatura ambiente","1 colher (café) de bicarbonato","1 colher (sopa) de margarina light para untar","Calda: 1 xícara (chá) de ameixa-preta sem caroço","Calda: 2 xícaras (chá) de água","Calda: 1 pedaço de casca de laranja","Calda: 1 colher (sopa) de baunilha"]', 'Bata as claras e o bicarbonato na batedeira por cerca de 5 minutos, até o ponto de pico.
Unte a forma de pudim com a margarina e despeje as claras batidas.
Coloque a forma em uma assadeira com água quente (banho-maria) e asse por cerca de 15 minutos ou até dourar por cima.
Calda: ferva a água por 10 minutos, acrescente as ameixas e a casca de laranja e ferva por mais 10 minutos. Acrescente a baunilha.
Bata no liquidificador até obter uma calda homogênea e passe pela peneira.
Desenforme o pudim morno e regue com a calda de ameixa em volta.', NULL, NULL, NULL, 33, 'lanche', TRUE);

-- 170. Salame de chocolate
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('a5c4c53d-7065-5710-a9d8-9c5d88a88c54', 'Salame de chocolate', 'Sobremesa · Diabetes', '["3 gemas","1/2 xícara (chá) de adoçante para forno e fogão","1 colher (sopa) de rum","1 colher (sopa) de cacau em pó sem açúcar","1/3 de xícara (chá) de margarina light em temperatura ambiente","1 embalagem de biscoito wafer de chocolate sem açúcar (140 g) triturado"]', 'Bata as gemas com o adoçante na batedeira até ficar uma mistura clara.
Junte a margarina aos poucos e bata mais.
Retire da batedeira e acrescente o cacau peneirado, o biscoito e o rum. Misture bem.
Coloque sobre uma folha de papel-alumínio e embrulhe bem, no formato de um salame.
Leve para gelar por aproximadamente 5 horas. Desembrulhe e corte em fatias.', NULL, NULL, NULL, 142, 'lanche', TRUE);

-- 171. Torta de maracujá diet
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('f5184a76-0bb0-5f64-8040-be3579456134', 'Torta de maracujá diet', 'Sobremesa · Diabetes', '["Massa: 1/2 xícara (chá) de farinha de trigo integral","Massa: 1/4 de xícara (chá) de farinha de trigo","Massa: 2 colheres (sopa) de leite desnatado","Massa: 3 colheres (sopa) de margarina sem sal","Massa: 1 colher (café) de essência de baunilha","Massa: 1 colher (sopa) de adoçante em pó para forno e fogão","Recheio: 1/2 xícara (chá) de creme de leite light","Recheio: 1/2 xícara (chá) de suco de maracujá","Recheio: 3 colheres (sopa) de adoçante em pó para forno e fogão","Recheio: 1 xícara (chá) de leite desnatado","Recheio: 1 colher (sopa) rasa de amido de milho","Recheio: 1 envelope de gelatina em pó incolor sem sabor","Recheio: 4 colheres (sopa) de água","Calda: 2 colheres (chá) de amido de milho","Calda: 1 colher (sopa) de adoçante em pó para forno e fogão","Calda: suco de 2 maracujás","Calda: polpa de 1 maracujá","Calda: 1 xícara (chá) de água"]', 'Massa: misture os ingredientes e forre apenas o fundo da forma. Asse em forno médio (180 °C) até dourar. Reserve.
Recheio: misture o leite e o amido de milho e leve ao fogo para engrossar.
Dissolva a gelatina na água fria, mexa bem e adicione ao creme. Acrescente o creme de leite e retire do fogo.
Adicione o suco de maracujá e o adoçante. Coloque sobre a massa e leve à geladeira até firmar.
Calda: misture os ingredientes e leve ao fogo para engrossar. Deixe esfriar e coloque sobre a torta.', NULL, NULL, 8, 112, 'lanche', TRUE);

-- 172. Sorbet de frutas vermelhas e mel
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('ad5f559d-e841-5fd2-b373-9ccc53f3f25b', 'Sorbet de frutas vermelhas e mel', 'Sobremesa · Doenças cardiovasculares', '["200 g de morangos","200 g de framboesas","2 copos de gelo","4 colheres (sopa) de mel","1 copo de vinho branco seco","Hortelã para decorar"]', 'Deixe as frutas congeladas (pode usar polpa congelada).
No liquidificador, bata as frutas congeladas, o gelo e o vinho branco até virar uma massa congelada.
Separe 5 taças e coloque um pouco de mel no fundo de cada uma.
Despeje o sorbet e enfeite com hortelã. Sirva gelado, com canudos.', NULL, NULL, 5, NULL, 'lanche', TRUE);

-- 173. Bolo de banana com cacau
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('adc2cc5b-537a-57ed-8971-3bfea29b5972', 'Bolo de banana com cacau', 'Sobremesa · Fibras', '["3 bananas amassadas","3 ovos","1 xícara (chá) de açúcar mascavo","1 xícara (chá) de farelo de aveia","1/2 xícara (chá) de farinha de trigo","1 colher (sopa) de cacau em pó","1 colher (sobremesa) de fermento em pó","1/2 xícara (chá) de água morna","1 pitada de canela","Margarina para untar e farinha para polvilhar"]', 'Bata na batedeira a banana, os ovos, o açúcar, o farelo e a água.
Adicione lentamente a farinha, a canela, o cacau e o fermento.
Unte uma assadeira e polvilhe farinha.
Asse em forno preaquecido a 180 °C por cerca de 40 minutos.', NULL, NULL, 12, 141, 'lanche', TRUE);

-- 174. Cuca integral de cascas de banana e ameixa-seca
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('9395f771-d570-542d-9f8a-5fffa86bdb32', 'Cuca integral de cascas de banana e ameixa-seca', 'Sobremesa · Fibras', '["Massa: 1 xícara (chá) de farinha de trigo","Massa: 1 xícara (chá) de farinha integral","Massa: 1/2 xícara (chá) de manteiga","Massa: 1 1/2 xícara (chá) de açúcar","Massa: 1 colher (sopa) de fermento em pó","Massa: 2 ovos","Massa: 1 xícara (chá) de leite","Recheio: 6 bananas-prata com casca","Recheio: 6 ameixas-secas","Cobertura: farinha, manteiga e 1/2 xícara (chá) de canela"]', 'Massa: misture as farinhas com a manteiga, o açúcar e o fermento, formando uma farofa. À parte, bata os ovos com o leite e reserve.
Recheio: retire as cascas das bananas e cozinhe as cascas com as ameixas em água fervente por cerca de 5 minutos. Esfrie e pique finamente. Corte as bananas em fatias.
Cobertura: faça outra farofa com farinha, manteiga e canela.
Forre uma assadeira com papel-alumínio, unte com manteiga e faça uma camada com metade da farofa da massa.
Cubra com as ameixas, as fatias de banana e as cascas e despeje metade do líquido da massa.
Faça mais uma camada com o restante da farofa e despeje o restante do líquido.
Coloque a farofa de cobertura e asse por 40 minutos a 180 °C. Sirva quente com sorvete ou frio.', NULL, NULL, 12, 366, 'lanche', TRUE);

-- 175. Frozen de manga e abacaxi
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('1c58800a-b2f3-51f1-8b41-7ad14a4dd40d', 'Frozen de manga e abacaxi', 'Sobremesa · Fibras', '["2 mangas picadas e congeladas","1/2 abacaxi congelado","1 pote de iogurte natural congelado","1/2 xícara (chá) de açúcar"]', 'No liquidificador, bata todos os ingredientes até obter um creme homogêneo.
Sirva imediatamente.', NULL, NULL, 4, 195, 'lanche', TRUE);

-- 176. Mousse de ameixa
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('9006cb47-d873-5842-a81f-a8e25027bd02', 'Mousse de ameixa', 'Sobremesa · Fibras', '["10 ameixas-secas sem caroço","1 pacote de polpa de ameixa congelada","1 lata de leite condensado","1 lata de creme de leite"]', 'Bata no liquidificador a polpa congelada com o leite condensado e o creme de leite.
Acrescente as ameixas e bata apenas para desmanchá-las.
Coloque em taças e leve ao congelador.', NULL, NULL, 10, 131, 'lanche', TRUE);

-- 177. Bruschettas de ricota e tomate
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('c8097f9b-c83d-5446-abd8-2d6853956eeb', 'Bruschettas de ricota e tomate', 'Sobremesa · Hipertensão', '["12 fatias de pão de forma","200 g de ricota","4 colheres (sopa) de azeite extravirgem","2 dentes de alho","1/2 xícara (chá) de manjericão","12 tomates-cereja"]', 'Disponha as fatias de pão em uma travessa, esfregue os dentes de alho sobre elas, regue com metade do azeite e leve ao forno para dourar.
Em uma vasilha, misture os tomates-cereja cortados em 4, as folhas de manjericão, a ricota ralada e o restante do azeite.
Cubra as fatias de pão com a mistura e leve ao forno para gratinar. Sirva quente.', NULL, NULL, 12, 99, 'lanche', TRUE);

-- 178. Purê de abóbora assada
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('0be74348-5083-5afc-883c-a60bb40db060', 'Purê de abóbora assada', 'Sobremesa · Hipertensão', '["1 kg de abóbora","1/4 de xícara de azeite extravirgem","Galhos de tomilho","2 xícaras de caldo de frango","1 colher (sopa) de parmesão ralado","Pimenta-branca a gosto","Noz-moscada a gosto"]', 'Corte a abóbora em 4 pedaços e retire as sementes.
Embrulhe os pedaços em papel-alumínio com galhos de tomilho e azeite e asse em forno forte por cerca de 40 minutos.
Retire do forno, raspe a polpa e leve ao fogo com o caldo de frango, o queijo e os temperos.
Misture até ficar bem cremoso e o queijo derreter.', NULL, NULL, 4, 97, 'almoco', TRUE);

-- 179. Purê de espinafre
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('60a0b6ce-d59c-502e-bf83-40f03b63abe5', 'Purê de espinafre', 'Sobremesa · Hipertensão', '["400 g de espinafre","1,1 kg de ricota","1 cebola grande picada","1 colher (sopa) de farinha de trigo integral","200 ml de leite desnatado","1 colher (sopa) de requeijão light","2 pitadas de noz-moscada","Caldo de legumes"]', 'Cozinhe o espinafre no caldo de legumes.
Bata no processador com o leite até obter um purê e reserve.
Em uma panela, derreta o requeijão e refogue a cebola até amolecer.
Acrescente a farinha aos poucos, cozinhando até dourar.
Acrescente o purê de espinafre (e a ricota) e cozinhe por alguns minutos.
Adicione a noz-moscada, misture bem e sirva quente.', 'Na receita original a ricota aparece na lista de ingredientes, mas não no modo de preparo; incorpore-a ao purê junto com o espinafre.', NULL, 1, 381, 'almoco', TRUE);

-- 180. Flan de morango com suplemento
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('a9289551-94c8-54a9-9f78-6b96739d7e7e', 'Flan de morango com suplemento', 'Sobremesa · Insuficiência renal e hepática', '["2 colheres (sopa) de creme de leite","120 ml de suplemento nutricional à base de lipídeos sabor morango (emulsão de lipídeos)","1/2 pacote de gelatina sem sabor","1/2 xícara (chá) de morangos picados","4 colheres (sopa) de açúcar"]', 'Dissolva a gelatina conforme orientação do fabricante.
Bata todos os ingredientes no liquidificador até dissolver bem.
Coloque em um recipiente e leve à geladeira por 2 horas.', NULL, NULL, 2, 478, 'lanche', TRUE);

-- 181. Frapê de creme com canela
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('3ce16f9e-a7b5-5946-a776-38b2b29c3037', 'Frapê de creme com canela', 'Sobremesa · Insuficiência renal e hepática', '["5 gotas de essência de baunilha","1 suplemento nutricional sabor baunilha específico para insuficiência renal (200 ml)","1 colher (sopa) de glucose de milho","1 colher (café) de canela em pó","2 colheres (sopa) de sorvete de creme"]', 'Bata todos os ingredientes no liquidificador.
Leve à geladeira por cerca de 20 minutos para gelar. Sirva a seguir.', NULL, NULL, 1, 554, 'lanche', TRUE);

-- 182. Bolinho de chuva sem lactose
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('7cb8e232-2265-51e9-8f19-2a661627a69b', 'Bolinho de chuva sem lactose', 'Sobremesa · Lactose', '["3/4 de xícara (chá) de farinha de arroz","1/2 xícara (chá) de farinha de soja","1 xícara (chá) de bebida à base de soja sem sabor","1 xícara (chá) de açúcar mascavo","1 colher (sopa) de liga neutra (liga para sorvete)","Óleo para fritar"]', 'Misture todos os ingredientes, na ordem da lista.
Frite colheradas da massa em óleo bem quente.', NULL, NULL, NULL, NULL, 'lanche', TRUE);

-- 183. Pudim de laranja à base de soja
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('48c77c14-1980-5d26-aeb0-e5cd2f3a89bd', 'Pudim de laranja à base de soja', 'Sobremesa · Lactose', '["1 xícara (chá) de suco de laranja","1 xícara (chá) de creme de soja","2 xícaras (chá) de bebida à base de soja","4 ovos","Raspas de 1 laranja","Calda de caramelo para servir"]', 'Bata todos os ingredientes no liquidificador e depois acrescente as raspas de laranja.
Asse em banho-maria, em forma de pudim, a 160 °C por 50 minutos.
Deixe esfriar e sirva com calda de caramelo.', NULL, NULL, NULL, NULL, 'lanche', TRUE);

-- 184. Sorvete de creme sem lactose
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('908a8c5c-f4a9-5962-8b4e-c17ed71dcfba', 'Sorvete de creme sem lactose', 'Sobremesa · Lactose', '["1 lata de leite condensado de soja","2 caixas de creme de soja","3 gotas de essência de baunilha"]', 'Cozinhe a lata fechada de leite condensado de soja, coberta de água, em panela de pressão por 40 minutos. Espere esfriar antes de abrir.
Bata no liquidificador o leite condensado cozido com o creme de soja e a baunilha até ficar homogêneo.
Despeje em um refratário de vidro e leve ao congelador até firmar. Sirva em seguida.', NULL, NULL, NULL, NULL, 'lanche', TRUE);

-- 185. Taça de banana com creme de canela
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('a8c7111d-b165-5f1d-bdbc-6bf1d4cc2b38', 'Taça de banana com creme de canela', 'Sobremesa · Lactose', '["Banana: 2 colheres (sopa) de margarina sem leite","Banana: 2 colheres (sopa) de açúcar mascavo","Banana: 4 bananas-nanicas médias em rodelas","Creme: 3 colheres (sopa) de amido de milho","Creme: 3 xícaras (chá) de bebida à base de soja sem sabor","Creme: 1 colher (chá) de canela em pó","Creme: 1/2 xícara (chá) de açúcar mascavo","Creme: 3 colheres (sopa) de castanha-de-caju triturada"]', 'Em uma frigideira grande, aqueça a margarina, junte as bananas e o açúcar e cozinhe até as bananas ficarem macias.
Acomode as bananas no fundo de taças ou tigelas pequenas.
Creme: em uma panela média, dissolva o amido na bebida de soja, junte a canela e o açúcar e leve ao fogo médio por 5 minutos ou até engrossar, mexendo sempre.
Cubra as bananas com o creme e salpique a castanha-de-caju.
Sirva morna, fria ou gelada.', NULL, NULL, NULL, NULL, 'lanche', TRUE);

-- 186. Bolo de chá-verde e limão
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('02278af4-6f8a-5db4-bab0-5c640d198f2e', 'Bolo de chá-verde e limão', 'Sobremesa · Licopeno e polifenóis', '["2 1/2 xícaras (chá) de farinha de trigo integral peneirada","1/2 xícara (chá) de açúcar ou adoçante de uso culinário","1 colher (sopa) de fermento em pó","2 ovos","2 claras","6 colheres (sopa) de azeite de oliva extravirgem","1 copo de iogurte natural light","4 colheres (sopa) de chá-verde (erva seca)","1 xícara (café) de suco de limão","Calda: 1 colher (sopa) de açúcar light ou adoçante","Calda: 2 xícaras (café) de suco de limão"]', 'Em uma vasilha, misture a farinha integral, o açúcar e o fermento e reserve.
No liquidificador, bata os ovos, as claras, o azeite, o iogurte e o chá-verde até o chá ficar triturado.
Adicione aos poucos esse creme aos ingredientes secos, acrescente o suco de limão e misture até ficar homogêneo.
Despeje em uma forma untada e asse em forno preaquecido até que um palito espetado saia seco.
Calda: misture o suco de limão com o açúcar e regue o bolo.', NULL, NULL, 12, 228, 'lanche', TRUE);

-- 187. Clafoutis de uva
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('a20f9b9f-0e8c-5fbf-9901-aff5fe116125', 'Clafoutis de uva', 'Sobremesa · Licopeno e polifenóis', '["Massa: 3/4 de xícara (chá) de farinha integral","Massa: 1 xícara (chá) de leite","Massa: 1/2 xícara (chá) de açúcar","Massa: 2 colheres (sopa) de margarina light (e mais para untar)","Massa: essência de amêndoas a gosto","Massa: 24 uvas sem caroço","Massa: 2 ovos","Cobertura: 3 colheres (sopa) de leite em pó desnatado","Cobertura: 2 colheres (sobremesa) de açúcar"]', 'No processador ou liquidificador, bata por 1 minuto a farinha, o leite, os ovos, o açúcar, a essência e a margarina.
Deixe a massa descansar por 30 minutos e bata por mais 5 minutos.
Unte as forminhas com margarina, coloque em uma assadeira e leve ao forno por 10 minutos para aquecerem.
Retire do forno e encha as forminhas até a metade. Coloque 3 uvas em cada uma.
Leve novamente ao forno até crescer e dourar.
Misture os ingredientes da cobertura e polvilhe sobre os clafoutis ainda quentes.', NULL, NULL, 6, 416, 'lanche', TRUE);

-- 188. Mousse de chocolate ao azeite com calda de tangerina e alecrim
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('ecca68ce-bc77-57b8-85e6-f14dd76f45c7', 'Mousse de chocolate ao azeite com calda de tangerina e alecrim', 'Sobremesa · Licopeno e polifenóis', '["200 g de chocolate meio amargo","5 colheres (sopa) de azeite extravirgem (frutado)","2 colheres (sopa) de açúcar de confeiteiro peneirado","1/2 colher (chá) de licor de café","3 ovos (claras e gemas separadas)","Calda: 100 ml de suco de tangerina","Calda: 100 g de açúcar","Calda: 1 ramo de alecrim"]', 'Derreta o chocolate em banho-maria. Deixe esfriar um pouco e incorpore o azeite em fio.
Na batedeira, bata as gemas com o açúcar de confeiteiro até aumentar bem o volume. Adicione o licor.
Misture o chocolate aos poucos até incorporar. Reserve.
Bata as claras em neve bem firmes e adicione delicadamente à mistura de chocolate.
Divida em taças e leve à geladeira por pelo menos 4 horas.
Calda: aqueça o suco de tangerina com o açúcar e o alecrim até obter um xarope. Deixe esfriar e sirva sobre a mousse.', NULL, NULL, 4, 1030, 'lanche', TRUE);

-- 189. Pudim de melancia
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('1a77f2f6-4dcd-56cb-98d3-048278415799', 'Pudim de melancia', 'Sobremesa · Licopeno e polifenóis', '["400 ml de suco de melancia peneirado","2 colheres (sopa) de amido de milho","5 colheres (sopa) de açúcar","2 cravos-da-índia","100 ml de água","6 gotas de essência de jasmim"]', 'Em uma panela, misture todos os ingredientes e leve ao fogo brando, mexendo com uma colher de pau até obter consistência de pudim.
Deixe esfriar, mexendo de vez em quando.
Despeje em taças molhadas e leve à geladeira.
Desenforme no dia seguinte, apenas no momento de servir.', 'Decore com flores de jasmim, frutas em calda e pistache moído.', NULL, 2, 39, 'lanche', TRUE);

-- 190. Picolé de melancia e hortelã
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('66fe3aff-4148-52a1-89ca-e02ddfac20ef', 'Picolé de melancia e hortelã', 'Sobremesa · Mama', '["3 xícaras (chá) de suco de melancia","4 folhas de hortelã"]', 'No liquidificador, bata o suco de melancia com as folhas de hortelã.
Transfira para formas de picolé e leve ao congelador por 4 horas ou até ficar firme.', NULL, NULL, 5, 59, 'lanche', TRUE);

-- 191. Bolo de caneca sem glúten
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('72a8f82f-47bb-55ba-8fee-a188a8719336', 'Bolo de caneca sem glúten', 'Sobremesa · Preparações sem glúten', '["Massa: 1 ovo pequeno","Massa: 4 colheres (sopa) de leite ou leite de coco","Massa: 3 colheres (sopa) de óleo","Massa: 2 colheres (sopa) rasas de chocolate em pó","Massa: 4 colheres (sopa) rasas de açúcar","Massa: 1 colher (café) de fermento em pó","Massa: 4 colheres (sopa) rasas de creme de arroz","Calda: 1 colher (chá) de manteiga","Calda: 2 colheres (sopa) de leite ou leite de coco","Calda: 1 a 2 colheres (sopa) rasas de açúcar","Calda: 3 colheres (sopa) rasas de chocolate em pó"]', 'Massa: coloque o ovo na caneca e bata bem com um garfo.
Acrescente o óleo, o açúcar, o leite e o chocolate e bata mais.
Acrescente o creme de arroz e o fermento e mexa delicadamente até incorporar.
Leve ao micro-ondas por 3 minutos na potência máxima.
Calda: misture tudo e leve ao micro-ondas por 30 segundos na potência máxima. Despeje ainda quente sobre o bolo.', NULL, NULL, 1, NULL, 'lanche', TRUE);

-- 192. Bolo de cenoura sem glúten
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('88627d89-0dc7-557d-ada7-d1cf14b51ab5', 'Bolo de cenoura sem glúten', 'Sobremesa · Preparações sem glúten', '["3 cenouras médias","2 xícaras (chá) de açúcar","1 xícara (chá) de frutose","2 xícaras (chá) de creme de arroz (e mais para polvilhar)","3/4 de xícara (chá) de óleo de canola","1 colher (sopa) de fermento em pó","3 ovos"]', 'Bata no liquidificador as cenouras, o açúcar, a frutose, o óleo e os ovos.
Despeje em um recipiente e adicione o creme de arroz e o fermento.
Coloque em assadeira untada e polvilhada com creme de arroz e leve ao forno preaquecido até assar.', NULL, NULL, NULL, NULL, 'lanche', TRUE);

-- 193. Flan com calda de goiaba
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('61d28b24-2888-5ff4-bc9c-74182cbefb62', 'Flan com calda de goiaba', 'Sobremesa · Próstata', '["Flan: 1 envelope de gelatina em pó sem sabor","Flan: 1 lata de leite condensado","Flan: 1 lata (a medida) de leite","Flan: 2 potes de iogurte natural","Calda: 6 goiabas vermelhas sem casca picadas","Calda: 1 xícara (chá) de açúcar","Calda: 1 1/2 xícara (chá) de água"]', 'Flan: dissolva a gelatina conforme o fabricante.
Bata no liquidificador o leite condensado, o leite, o iogurte e a gelatina dissolvida.
Coloque em uma forma com furo central molhada e leve à geladeira por cerca de 4 horas.
Calda: em uma panela, coloque as goiabas, o açúcar e a água e cozinhe em fogo baixo por cerca de 20 minutos, até as goiabas desmancharem.
Bata no liquidificador e volte ao fogo por cerca de 15 minutos, até a calda engrossar.
Deixe esfriar e sirva sobre o flan.', NULL, NULL, 10, 197, 'lanche', TRUE);

-- 194. Frozen com frutas vermelhas
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('5e6042f7-78fc-57b8-8f67-382cbfda10ee', 'Frozen com frutas vermelhas', 'Sobremesa · Próstata', '["Frozen: 2 potes de iogurte natural desnatado","Frozen: 8 colheres (sopa) de açúcar","Frozen: 1 lata de creme de leite light","Calda: 100 g de morango picado","Calda: 100 g de amora","Calda: 100 g de framboesa","Calda: 1/2 xícara (chá) de açúcar"]', 'Frozen: misture o iogurte, o açúcar e o creme de leite e leve ao freezer por cerca de 8 horas.
Calda: leve ao fogo o morango, a amora e a framboesa com o açúcar e deixe ferver. Retire do fogo e espere esfriar.
Para servir, faça bolas de frozen e despeje a calda de frutas.', NULL, NULL, 6, 173, 'lanche', TRUE);

-- 195. Gelado de frutas vermelhas e chá-verde
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('b28e010d-91cc-5c5a-93f1-21e32a7c7b15', 'Gelado de frutas vermelhas e chá-verde', 'Sobremesa · Próstata', '["300 ml de água","1 colher (sobremesa) de chá-verde","2 morangos","1 polpa congelada de framboesa","Adoçante ou açúcar a gosto (opcional)"]', 'Ferva a água e despeje em uma xícara com o chá-verde. Aguarde 5 minutos e coe.
Deixe esfriar e leve ao freezer até congelar.
Bata os morangos, a polpa de framboesa e o chá-verde congelado.
Adoce se achar necessário e sirva a seguir.', NULL, NULL, 2, 33, 'lanche', TRUE);

-- 196. Sorvete de mamão com goiaba
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('8b42306b-2966-5e3e-becb-133c51dc229c', 'Sorvete de mamão com goiaba', 'Sobremesa · Próstata / Mama', '["2 potes de iogurte desnatado","2 mamões papaia","Suco de 2 goiabas inteiras","1 colher (sopa) de açúcar"]', 'Bata todos os ingredientes no liquidificador até obter uma mistura homogênea.
Leve ao congelador por cerca de 4 horas ou até congelar.
Bata novamente no liquidificador até obter um creme e retorne ao congelador por mais 1 hora. Sirva a seguir.', NULL, NULL, 2, 64, 'lanche', TRUE);

-- 197. Tapioca com linhaça e geleia de amora
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('f7225ff4-2490-575b-8d39-9bf04fedd3f0', 'Tapioca com linhaça e geleia de amora', 'Sobremesa · Próstata / Mama', '["Geleia: 200 g de amora","Geleia: 1 colher (sopa) de açúcar","Geleia: 150 ml de água","Tapioca: 200 g de goma de tapioca (fécula de mandioca hidratada)","Tapioca: 1 colher (sopa) de linhaça"]', 'Geleia: em uma panela, coloque as amoras, o açúcar e a água e cozinhe em fogo médio por cerca de 30 minutos, até obter consistência de geleia. Reserve.
Tapioca: peneire a goma de tapioca e incorpore a linhaça.
Distribua em uma frigideira antiaderente média. Quando a massa unir, vire do outro lado.
Distribua a geleia sobre a tapioca e sirva a seguir.', NULL, NULL, 2, 221, 'cafe', TRUE);

-- 198. Doce de caju em calda diet
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('68a80c56-7d61-5884-98c0-276b1a6d3faa', 'Doce de caju em calda diet', 'Sobremesa · Quimioterapia e radioterapia', '["10 cajus médios sem casca e sem castanha","1 xícara (chá) de adoçante para forno e fogão","1 L de água","1/2 colher (sopa) de cravo-da-índia","1 pedaço de canela em pau","Suco de 2 limões"]', 'Deixe os cajus de molho no suco dos limões por 5 minutos e escorra.
Leve à panela de pressão com o adoçante e a água. Depois que começar a apitar, cozinhe por mais 10 minutos.
Desligue e espere sair a pressão.
Acrescente o cravo e a canela e leve novamente ao fogo baixo até formar uma calda.', 'Indicações: diarreia.', NULL, 10, 38, 'lanche', TRUE);

-- 199. Frozen de manga
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('f9388dc2-630e-5f94-8fb5-fc418ffbc653', 'Frozen de manga', 'Sobremesa · Quimioterapia e radioterapia', '["2 mangas médias picadas","1 copo de iogurte natural","1 colher (sopa) de folhas de hortelã","1 colher (sopa) de mel"]', 'Bata todos os ingredientes no liquidificador.
Coloque em uma vasilha e leve ao freezer por 1 hora.
Despeje em taças individuais e sirva em seguida.', 'Indicações: dor, dificuldade para engolir e boca seca.', NULL, 3, 101, 'lanche', TRUE);

-- 200. Mousse de goiaba
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('a966b2b1-ee2f-562f-866a-0e3e992635cb', 'Mousse de goiaba', 'Sobremesa · Quimioterapia e radioterapia', '["1 pacote de gelatina em pó sem sabor","1 xícara (chá) de extrato de soja sem sabor","2 colheres (sopa) de açúcar","2 potes de iogurte","4 goiabas vermelhas"]', 'Dissolva a gelatina conforme orientação do fabricante e reserve.
Descasque e pique as goiabas. Bata no liquidificador com o extrato de soja e passe por uma peneira fina.
Retorne ao liquidificador e bata com o açúcar, o iogurte e a gelatina reservada.
Despeje em forminhas individuais e leve à geladeira por cerca de 4 horas.', 'Indicações: diarreia, feridas na boca e boca seca.', NULL, 6, 113, 'lanche', TRUE);

-- 201. Flan de chocolate com suplemento
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('65c02ea2-d76e-5a97-937b-92897267de97', 'Flan de chocolate com suplemento', 'Sobremesa · Receitas hipercalóricas', '["1 unidade de suplemento nutricional hipercalórico e normoproteico sabor chocolate","2 colheres (sopa) de creme de leite","1 colher (sopa) de achocolatado em pó","1/2 envelope de gelatina sem sabor"]', 'Dissolva a gelatina conforme orientação do fabricante.
Bata no liquidificador o suplemento, o creme de leite, o achocolatado e a gelatina.
Deixe na geladeira por 3 horas.', NULL, NULL, 2, 241, 'lanche', TRUE);

-- 202. Frapê de cappuccino
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('01a02118-43be-5a5b-92b2-6563ede4cf9f', 'Frapê de cappuccino', 'Sobremesa · Receitas hipercalóricas', '["125 ml de suplemento nutricional hipercalórico e hiperproteico sabor cappuccino","150 ml de leite integral","2 colheres (sopa) de achocolatado em pó","Chantili e biscoito tipo wafer para decorar"]', 'No liquidificador, bata o leite, o achocolatado e o suplemento.
Despeje em um copo e decore com chantili e o biscoito wafer. Sirva a seguir.', NULL, NULL, 1, 611, 'lanche', TRUE);

-- 203. Mousse de abacaxi com calda de maracujá
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('8abad5e6-db67-5bd3-81d8-315681a99065', 'Mousse de abacaxi com calda de maracujá', 'Sobremesa · Receitas hipercalóricas', '["Mousse: 1/2 envelope de gelatina sem sabor","Mousse: 1/2 copo de iogurte natural","Mousse: 4 colheres (sopa) de leite condensado","Mousse: 100 ml de suco natural de maracujá","Mousse: 1 unidade (200 ml) de suplemento nutricional hipercalórico e normoproteico sabor abacaxi","Calda: polpa de 1 maracujá","Calda: 3 colheres (sopa) de açúcar","Calda: 100 ml de água"]', 'Dissolva a gelatina conforme orientação do fabricante.
Bata no liquidificador o suplemento, o leite condensado, o iogurte, o suco de maracujá e a gelatina.
Deixe na geladeira por 2 horas.
Calda: em uma panela, coloque a polpa do maracujá, o açúcar e a água e leve ao fogo baixo até formar uma calda.
Espere esfriar e decore a mousse.', NULL, NULL, 2, 465, 'lanche', TRUE);

-- 204. Pavê de limão com suplemento
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('66fe3150-0409-52b5-8736-7003edbc8dbb', 'Pavê de limão com suplemento', 'Sobremesa · Receitas hipercalóricas', '["Mousse: 1/2 envelope de gelatina sem sabor","Mousse: 1 unidade (200 ml) de suplemento nutricional hipercalórico e hiperproteico sabor baunilha","Mousse: 2 colheres (sopa) de leite condensado","Mousse: 1/2 copo de iogurte natural","Mousse: suco de 1 1/2 limão","Mousse: 4 bolachas doces sem recheio","Creme: 1/2 copo de iogurte natural","Creme: suco de 1/2 limão","Creme: 4 colheres (sopa) de leite condensado"]', 'Dissolva a gelatina conforme orientação do fabricante.
No liquidificador, bata o suplemento, o leite condensado, o iogurte e o suco de limão. Acrescente a gelatina e misture bem.
Em um recipiente, coloque as bolachas e despeje a mousse. Leve à geladeira por 2 horas.
Creme: misture o iogurte, o leite condensado e o suco de limão e deixe gelar por 1 hora.
No momento de servir, coloque o creme sobre a mousse.', NULL, NULL, 2, 453, 'lanche', TRUE);

-- 205. Espumone de frutas vermelhas
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('f54d00b8-e9b7-5621-a3ff-3eecfbe7fded', 'Espumone de frutas vermelhas', 'Sobremesa · Receitas obstipantes', '["1/2 envelope de gelatina sem sabor","1/2 maçã sem casca picada","3 colheres (sopa) de iogurte desnatado","1 suplemento nutricional isento de lactose e gordura sabor frutas vermelhas (237 ml)"]', 'Dissolva a gelatina conforme orientação do fabricante.
Bata no liquidificador o suplemento, o iogurte e a gelatina.
Em um recipiente, coloque a maçã picada e o creme.
Leve à geladeira por 3 horas ou até adquirir a consistência desejada.', NULL, NULL, 2, 182, 'lanche', TRUE);

-- 206. Frapê de melancia
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('ee6ff14c-769f-512f-b16e-1d1c63170bf7', 'Frapê de melancia', 'Sobremesa · Receitas obstipantes', '["100 ml de suplemento nutricional isento de lactose e gordura sabor frutas vermelhas","1 envelope de gelatina sabor cereja","200 ml de suco de melancia"]', 'Dissolva a gelatina conforme orientação do fabricante e leve à geladeira até adquirir consistência.
Bata no liquidificador o suco de melancia, o suplemento e a gelatina.
Leve novamente à geladeira para gelar. Sirva a seguir.', NULL, NULL, 2, 169, 'lanche', TRUE);

-- 207. Gelado de frutas vermelhas com suplemento
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('c32603ab-d343-5cbe-88c6-ff14a42a6360', 'Gelado de frutas vermelhas com suplemento', 'Sobremesa · Receitas obstipantes', '["1/2 maçã sem casca picada","1 fatia pequena de melancia","Gelo","1 suplemento nutricional isento de lactose e gordura sabor frutas vermelhas (237 ml)"]', 'Bata no liquidificador o suplemento, a maçã, a melancia e o gelo.
Sirva a seguir.', NULL, NULL, 1, 336, 'lanche', TRUE);

-- 208. Creme de morango com tofu
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('1ac708d9-499d-503c-9de8-d817a8c4ab44', 'Creme de morango com tofu', 'Sobremesa · Receitas saborosas com soja', '["1 copo de tofu cremoso","1/2 copo de leite de soja gelado","1 copo de morangos frescos","2 colheres (sopa) de frutose","8 folhas de hortelã (e mais para decorar)"]', 'Bata os ingredientes no liquidificador.
Distribua o creme em tacinhas individuais.
Mantenha na geladeira por 3 horas antes de servir e decore com folhas de hortelã.', NULL, NULL, 3, 300, 'lanche', TRUE);

-- 209. Rocambole de suflê de brócolis
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('53f7bd01-8f94-557d-ba77-266afa6ff326', 'Rocambole de suflê de brócolis', 'Sobremesa · Receitas saborosas com soja', '["500 g de brócolis","3/4 de xícara (chá) de farinha de trigo","1 colher (chá) de mostarda seca","6 colheres (sopa) de manteiga ou margarina","1/2 colher (chá) de sal","3 1/2 xícaras (chá) de leite","4 ovos (claras e gemas separadas)","120 g de queijo minas ou prato (cerca de 1 xícara)"]', 'Cozinhe o brócolis al dente, corte em pedacinhos e reserve.
Derreta a manteiga numa caçarola e adicione a farinha, a mostarda seca, o sal e 3 xícaras de leite. Quando começar a ferver, separe 1 xícara desse molho e reserve.
Bata as gemas e misture na massa. Bata as claras em neve e incorpore.
Forre uma assadeira (27 x 39 cm) com papel-alumínio untado e polvilhado com farinha.
Espalhe a massa e asse a 165 °C por 20 a 30 minutos, até dourar e voltar à forma quando tocada com o dedo.
Misture a xícara de molho reservada com 1/2 xícara de leite e o queijo em pedaços e leve ao fogo até o queijo derreter. Separe 1 xícara desse molho de queijo e misture o restante ao brócolis.
Vire o suflê sobre uma toalha e coloque o brócolis sobre 3/4 da massa.
Enrole devagar e coloque numa travessa com a emenda para baixo.
Despeje por cima a xícara de molho de queijo reservada e sirva em seguida.', NULL, NULL, 8, 223, 'jantar', TRUE);

-- 210. Bolo de banana com aveia
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('114da365-eb08-5dbc-b94c-692b7802de64', 'Bolo de banana com aveia', 'Sobremesa · Refeições mais saborosas', '["3 bananas-nanicas médias","1 xícara de azeite de oliva","3 ovos (claras e gemas separadas)","1 xícara (chá) de açúcar mascavo","1 xícara (chá) de farinha de trigo","1 colher (sopa) de fermento em pó","1 1/2 xícara (chá) de farinha de aveia","1 xícara (chá) de castanha-do-pará moída","150 g de uvas-passas","Cobertura: 1 colher (sopa) de açúcar de confeiteiro","Cobertura: 1 colher (chá) de canela em pó"]', 'Preaqueça o forno (médio).
Descasque e pique as bananas e coloque no liquidificador com o azeite (reserve 2 colheres de sopa), as gemas e o açúcar. Bata por 5 minutos, até obter um creme leve, e reserve.
Peneire a farinha de trigo com o fermento em uma tigela e misture a farinha de aveia, as castanhas e as uvas-passas.
Incorpore aos poucos ao creme, mexendo delicadamente até a massa ficar homogênea.
Por fim, incorpore as claras em neve com cuidado.
Despeje em uma forma de pão (2 litros) untada com o azeite reservado e enfarinhada.
Asse por 50 minutos ou até que um palito saia limpo. Desenforme ainda morno e polvilhe açúcar de confeiteiro e canela.', NULL, NULL, 16, 300, 'lanche', TRUE);

-- 211. Doce de gengibre
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('6b957bc3-b17f-5c85-be54-f3068a4bfee6', 'Doce de gengibre', 'Sobremesa · Refeições mais saborosas', '["2 xícaras (chá) de leite desnatado","1 colher (sopa) de gengibre ralado","6 gemas","1/2 xícara (chá) de adoçante para forno e fogão","2 envelopes de gelatina sem sabor dissolvidos em 3 colheres (sopa) de água fria e depois aquecidos","1 xícara (chá) de creme de leite light"]', 'Ferva o leite com o gengibre.
Na batedeira, bata as gemas com o adoçante, junte o leite quente e mexa.
Passe pela peneira, leve ao fogo e mexa até engrossar.
Deixe amornar, misture a gelatina e deixe esfriar.
Quando começar a endurecer, junte o creme de leite e mexa.
Distribua em forminhas molhadas com água e leve à geladeira até endurecer. Desenforme e sirva.', NULL, NULL, 8, 123, 'lanche', TRUE);

-- 212. Bavaroise de baunilha com ameixas
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('e3e609b4-9a9d-58d7-b7db-008e61e2c450', 'Bavaroise de baunilha com ameixas', 'Sobremesa · Sobremesas gostosas', '["2 pacotes de gelatina sem sabor em pó","1,2 L de leite integral","1/2 xícara (chá) de açúcar","2 colheres (sopa) de essência de baunilha","100 g de ameixa-seca picada","500 ml de creme de leite fresco","Óleo para untar","Hortelã para decorar"]', 'Aqueça o leite em uma panela e dissolva a gelatina e o açúcar.
Espere amornar e acrescente as ameixas picadas, o creme de leite e a essência de baunilha. Misture bem.
Unte uma forma de pudim ou várias formas pequenas e despeje o creme.
Mantenha na geladeira de um dia para o outro.
Desenforme e decore com folhas de hortelã.', NULL, NULL, 10, 49, 'lanche', TRUE);

-- 213. Brownie
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('085dcf64-518d-5fa5-975f-e5752c05a4d0', 'Brownie', 'Sobremesa · Sobremesas gostosas', '["3 xícaras (chá) de açúcar","2 xícaras (chá) de farinha de trigo","1 1/2 xícara (chá) de achocolatado em pó","4 ovos","1 tablete de manteiga derretida (e mais para untar)","Nozes ou amêndoas picadas a gosto"]', 'Em uma tigela, misture o açúcar, a farinha e o achocolatado.
Adicione os ovos, a manteiga derretida e as nozes e misture com uma colher até ficar homogêneo (não precisa bater).
Despeje em uma forma untada com manteiga e farinha.
Asse em forno preaquecido por aproximadamente 20 a 30 minutos.', NULL, NULL, 9, 494, 'lanche', TRUE);

-- 214. Carpaccio de melancia e melão
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('ba89b7d3-1d8f-5e6d-96d3-fa411333f860', 'Carpaccio de melancia e melão', 'Sobremesa · Sobremesas gostosas', '["1 melancia pequena","2 melões","2 colheres (sopa) de açúcar mascavo","1 colher (sopa) de canela","Raspas de 2 limões"]', 'Retire as cascas e as sementes da melancia e dos melões.
Corte cubos grandes (10 x 10 cm) e depois tire fatias finas desses cubos.
Disponha em pratos, intercalando fatias de melancia e de melão como pétalas, e reserve na geladeira.
Em uma tigela pequena, misture a canela e o açúcar mascavo e polvilhe sobre as fatias.
Espalhe as raspas de limão no final e sirva gelado.', NULL, NULL, 8, 99, 'lanche', TRUE);

-- 215. Espumone de maracujá
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('18db3c3f-71cf-54a0-b658-13663b858463', 'Espumone de maracujá', 'Sobremesa · Sobremesas gostosas', '["Polpa de 8 maracujás","3 xícaras (chá) de água (2 1/2 para a polpa e 1/2 para a gelatina)","1 lata de leite condensado","3 pacotes de gelatina sem sabor em pó","Óleo para untar"]', 'Passe a polpa de maracujá misturada com 2 1/2 xícaras de água por uma peneira, reservando as sementes.
Leve o suco ao fogo até amornar.
Transfira para um pote plástico com tampa e acrescente o leite condensado e a gelatina hidratada na 1/2 xícara de água (dissolvida conforme o fabricante).
Feche o pote com filme plástico e a tampa, bem vedado, e sacuda vigorosamente por 5 minutos.
Transfira para uma forma canelada untada com óleo e leve à geladeira por aproximadamente 4 horas.
Desenforme com cuidado e sirva com as sementes de maracujá.', NULL, NULL, 10, 162, 'lanche', TRUE);

-- 216. Miscelânea de frutas
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('08a64f04-8fd0-52ae-aeea-b6d107765646', 'Miscelânea de frutas', 'Sobremesa · Sobremesas gostosas', '["1 xícara (chá) de suco de maracujá","3 1/2 pacotes de gelatina sem sabor em pó","4 kiwis","4 maçãs"]', 'Retire as cascas das frutas e as sementes das maçãs e corte em cubos médios.
Distribua em 5 taças e reserve.
Dissolva a gelatina no suco de maracujá em banho-maria.
Cubra as frutas com essa mistura e leve à geladeira até firmar.', NULL, NULL, 5, 123, 'lanche', TRUE);

-- 217. Panacota de manga
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('f7a0fb33-f852-53da-af9a-f8fdbe35aeef', 'Panacota de manga', 'Sobremesa · Sobremesas gostosas', '["1 pacote de gelatina sem sabor em pó","4 mangas médias","1 lata de leite condensado","1/2 xícara (chá) de água"]', 'Misture a gelatina com a água e dissolva em banho-maria. Depois de diluída, misture ao leite condensado e reserve.
Descasque as mangas, corte em pedaços grandes e bata no liquidificador.
Acrescente o líquido reservado e bata novamente até ficar homogêneo.
Porcione em taças e leve à geladeira para firmar, de preferência por um dia.
Sirva gelado; se quiser, acrescente calda de frutas.', NULL, NULL, 12, 167, 'lanche', TRUE);

-- 218. Pavê de baunilha com coulis de frutas vermelhas
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('b036960d-4613-5890-93cd-1ec80568b52c', 'Pavê de baunilha com coulis de frutas vermelhas', 'Sobremesa · Sobremesas gostosas', '["Pavê: 1 lata de leite condensado","Pavê: 1 xícara (chá) de leite","Pavê: 4 gemas","Pavê: 1/4 de xícara (chá) de chocolate em pó","Pavê: 1/4 de xícara (chá) de água","Pavê: 1 pacote de biscoito champanhe","Pavê: 1 colher (chá) de essência de baunilha","Coulis: 100 g de amora","Coulis: 100 g de morango","Coulis: 1/4 de xícara (chá) de água","Coulis: 4 colheres (sopa) de açúcar"]', 'Pavê: em uma panela média, em fogo moderado, cozinhe o leite condensado, o leite, as gemas e a baunilha por cerca de 5 minutos, mexendo sempre, até virar um creme. Transfira para um refratário e espere esfriar.
Na mesma panela, misture o chocolate em pó com a água e deixe ferver em fogo alto. Retire do fogo e reserve.
Coulis: em uma panela pequena, misture todos os ingredientes e deixe ferver, mexendo sempre, até virar uma calda. Reserve.
Montagem: em um refratário, disponha os biscoitos lado a lado e regue com a calda de chocolate e 1/3 do coulis.
Coloque metade do creme por cima e repita a camada.
Por último, regue com o restante do coulis.', NULL, NULL, 10, 452, 'lanche', TRUE);

-- 219. Salada de frutas refrescante com chantili de ricota
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('576a264c-9b22-5e82-b0c3-b4d19a529fb2', 'Salada de frutas refrescante com chantili de ricota', 'Sobremesa · Sobremesas gostosas', '["2 ameixas vermelhas","2 peras verdes pequenas","8 kiwis","2 melões em fatias","2 morangos","1/2 maço de hortelã","2 galhos de manjericão","200 ml de suco de laranja","Chantili: 1 kg de ricota fresca","Chantili: 1 xícara (chá) de mel","Chantili: raspas de 1 limão","Chantili: 3 gotas de essência de baunilha","Chantili: 1 xícara (chá) de água mineral"]', 'Pique todas as frutas em pedaços médios e misture com a hortelã e o manjericão picados. Acrescente o suco de laranja.
Chantili: bata no liquidificador a ricota com a água mineral por 5 minutos.
Com o liquidificador desligado, acrescente aos poucos o mel, a baunilha e, por último, as raspas de limão. Misture delicadamente.
Sirva com a salada de frutas.', 'Se preferir, forre o fundo das tacinhas com um pouco de geleia de framboesa.', NULL, 12, 225, 'lanche', TRUE);

-- 220. Suflê de morangos
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('c6c3f9ce-1fa5-5ead-8255-f752326da1c0', 'Suflê de morangos', 'Sobremesa · Sobremesas gostosas', '["300 g de morangos","1/2 xícara (chá) de açúcar","1 colher (sopa) de manteiga","2 gemas","5 claras em neve","1 limão (suco coado)","2 colheres (sopa) de conhaque","1 colher (sopa) de açúcar de confeiteiro","1 ramo de hortelã"]', 'Lave e escorra os morangos com cuidado. Reserve 3 para decorar e retire os cabinhos dos demais.
Bata 2/3 deles no liquidificador com o açúcar, o suco de limão e o conhaque.
Acrescente as gemas, uma por vez, aos morangos batidos.
Unte 4 ramequins com manteiga e polvilhe cada um com 1 colher (café) de açúcar de confeiteiro.
Bata as claras em neve bem firmes e incorpore delicadamente, de baixo para cima, para não perder o volume.
Divida entre os ramequins e acrescente o restante dos morangos em pedacinhos, apertando-os levemente na superfície.
Asse em forno preaquecido a 210 °C por 10 minutos.
Decore com os morangos reservados e folhas de hortelã e polvilhe o restante do açúcar de confeiteiro.', NULL, NULL, 4, NULL, 'lanche', TRUE);

-- 221. Tiramisu
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('037f795f-a1b6-53b1-92fd-c6313d6a7550', 'Tiramisu', 'Sobremesa · Sobremesas gostosas', '["2 caixas de biscoito champanhe","1 xícara (café) de café pronto","1/4 de xícara (chá) de conhaque","1 pote de cream cheese","2 colheres (café) de essência de baunilha","3 colheres (sopa) de açúcar","1 colher (sopa) de café em pó","2 colheres (sopa) de chocolate em pó","2 xícaras (chá) de creme de leite fresco"]', 'Em uma tigela média, misture o café pronto com o conhaque e reserve.
Em outra tigela, misture o cream cheese com o açúcar e a baunilha e reserve.
Bata o creme de leite até obter picos firmes e misture levemente, com uma espátula, ao creme de cream cheese.
Em taças, disponha uma camada de biscoitos, regue com o café com conhaque e cubra com o creme.
Faça mais uma camada igual e polvilhe o chocolate e o café em pó.
Leve à geladeira por cerca de 1 hora e sirva gelado.', NULL, NULL, 20, 218, 'lanche', TRUE);

-- 222. Torta de goiaba e maracujá
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('7413f704-0df4-5e0b-b342-7ca94d6220ea', 'Torta de goiaba e maracujá', 'Sobremesa · Tumores abdominais', '["Massa: 2 1/2 xícaras (chá) de farinha de trigo","Massa: 1 colher (café) de sal","Massa: 5 colheres (sopa) de margarina light","Massa: 1 ovo","Massa: 2 gemas","Recheio: 1 pacote de gelatina sem sabor","Recheio: 1 colher (café) de sal","Recheio: 2 xícaras (chá) de suco de maracujá natural","Recheio: 2 1/2 xícaras (chá) de adoçante para forno e fogão","Recheio: 1 kg de goiaba vermelha sem casca e sem sementes"]', 'Massa: em uma tigela, misture a farinha e o sal. Faça um buraco no centro e adicione a margarina, o ovo e as gemas. Misture bem até formar uma massa homogênea.
Abra com um rolo, forre o fundo e a lateral de uma forma de aro removível e asse em forno preaquecido. Reserve.
Recheio: dissolva a gelatina conforme o fabricante.
Em uma panela, ferva o suco de maracujá com o adoçante por cerca de 3 minutos. Abaixe o fogo, adicione as goiabas e cozinhe até ficarem macias.
Retire do fogo, adicione a gelatina, misture bem e deixe esfriar.
Distribua o recheio sobre a massa e leve à geladeira por 6 horas.', NULL, NULL, 10, 208, 'lanche', TRUE);

-- 223. Suco de melancia com gengibre e linhaça
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('cef3baf0-adaf-550a-a537-331f8f43fccb', 'Suco de melancia com gengibre e linhaça', 'Bebida · Alimentos funcionais', '["4 fatias médias de melancia","2 folhas de hortelã","1 colher (sobremesa) de semente de linhaça","1 colher (café) de gengibre ralado","500 ml de água","Gelo"]', 'Bata todos os ingredientes no liquidificador e sirva em seguida.', NULL, NULL, 2, 87, 'lanche', TRUE);

-- 224. Suco verde
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('ccc94fdc-bf34-5c9c-aac4-0c22d46fc77d', 'Suco verde', 'Bebida · Anemia', '["1 xícara (chá) de polpa de maracujá","2 xícaras (chá) de couve em tiras","1/2 xícara (chá) de suco de limão","1 L de água","Gelo","Adoçante ou açúcar a gosto"]', 'Bata todos os ingredientes no liquidificador e sirva a seguir.', NULL, NULL, 6, 89, 'lanche', TRUE);

-- 225. Suco de casca de jabuticaba com água de coco
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('ff7a2450-206d-5be3-aa05-752fbee6b1a9', 'Suco de casca de jabuticaba com água de coco', 'Bebida · Aproveitamento integral dos alimentos', '["Cascas de 20 jabuticabas","1 L de água de coco","Açúcar a gosto"]', 'Bata todos os ingredientes no liquidificador.
Coe o suco.', NULL, NULL, 5, 50, 'lanche', TRUE);

-- 226. Suco de casca de manga
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('cdd717b2-db3e-5880-8822-ab151ce33865', 'Suco de casca de manga', 'Bebida · Aproveitamento integral dos alimentos', '["Cascas de 3 mangas grandes","1 1/2 L de água","Açúcar a gosto"]', 'Lave e higienize as mangas em água corrente e solução de hipoclorito de sódio, seguindo as instruções do rótulo.
Descasque as mangas e bata as cascas no liquidificador com um pouco de água.
Coe, adoce a gosto e complete com o restante da água.', NULL, NULL, 8, 30, 'lanche', TRUE);

-- 227. Suco de talos de agrião com limão
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('4986c133-8b8e-50c4-bfa1-57e71b974348', 'Suco de talos de agrião com limão', 'Bebida · Aproveitamento integral dos alimentos', '["Talos de 1/2 maço de agrião","2 limões","1 L de água","5 colheres (sopa) de açúcar"]', 'Extraia o suco dos limões.
Bata todos os ingredientes no liquidificador.
Coe o suco.', NULL, NULL, 5, 84, 'lanche', TRUE);

-- 228. Suco de manga com cenoura
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('4f3c652c-4ca1-5e13-baf7-575ae29110bf', 'Suco de manga com cenoura', 'Bebida · Cabeça e pescoço', '["1/2 xícara de manga em cubos","1 cenoura em rodelas","1/2 maço de hortelã","1 limão espremido","200 ml de água gelada","Mel a gosto"]', 'Bata todos os ingredientes no liquidificador e adoce com mel.
Sirva a seguir.', NULL, NULL, 2, 53, 'lanche', TRUE);

-- 229. Leite enriquecido
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('9fe69b67-c0a2-5362-9d84-b5e6e0140a22', 'Leite enriquecido', 'Bebida · Como enriquecer os alimentos', '["1 L de leite semidesnatado","1 xícara (chá) de leite em pó desnatado instantâneo"]', 'Bata na batedeira por 5 minutos o leite em pó com o leite.
Guarde na geladeira.', 'Pode ser usado no lugar do leite comum em mingaus, molhos, vitaminas e outras receitas.', NULL, NULL, NULL, 'cafe', TRUE);

-- 230. Milk-shake de abacate com castanha-do-pará e leite enriquecido
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('26d207b4-511b-5e83-a495-ceff2f79b3bc', 'Milk-shake de abacate com castanha-do-pará e leite enriquecido', 'Bebida · Como enriquecer os alimentos', '["1 xícara (chá) de leite enriquecido","1 bola grande de sorvete","1 abacate grande sem casca e sem caroço","2 colheres (sopa) de castanha-do-pará picada","50 g de chocolate em lascas","1 xícara de chantili"]', 'Bata o leite, o sorvete, o abacate e as castanhas no liquidificador.
Para decorar, coloque chantili sobre o milk-shake e polvilhe lascas de chocolate.', NULL, NULL, 2, NULL, 'lanche', TRUE);

-- 231. Refrigerante caseiro de laranja (cenoura, limão e maracujá)
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('38454dbe-b9bf-559d-b11d-d917124cca62', 'Refrigerante caseiro de laranja (cenoura, limão e maracujá)', 'Bebida · Diabetes', '["3 cenouras","2 limões","1 maracujá","1 L de água mineral com gás","Adoçante a gosto (opcional)"]', 'Bata as cenouras no liquidificador e coe, retirando o bagaço (aproveite-o em outra preparação).
Misture o suco de cenoura ao suco dos limões e do maracujá.
Por último, acrescente a água com gás e, se necessário, adoçante.', NULL, NULL, 4, 35, 'lanche', TRUE);

-- 232. Shake de banana com aveia
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('6b233268-65c3-5a0d-801f-8553f900083b', 'Shake de banana com aveia', 'Bebida · Diabetes', '["1 suplemento nutricional para diabetes sabor baunilha (200 ml)","1 banana-prata","1 colher (sopa) de aveia em flocos","Gelo"]', 'No liquidificador, bata o suplemento, a banana, a aveia e o gelo.
Sirva a seguir.', NULL, NULL, 1, 336, 'cafe', TRUE);

-- 233. Suco de casca de abacaxi com hortelã
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('9a6cb170-b0a0-5f89-9a39-585194c584ea', 'Suco de casca de abacaxi com hortelã', 'Bebida · Diabetes', '["Cascas de 1 abacaxi","20 folhas de hortelã","1 xícara (café) de suco de limão","1 1/2 L de água","Adoçante a gosto"]', 'Lave a casca do abacaxi em água corrente e deixe de molho em solução de hipoclorito de sódio.
Bata no liquidificador as cascas com a hortelã e a água.
Coe, acrescente o suco de limão e o adoçante e bata novamente. Sirva a seguir.', NULL, NULL, 6, 31, 'lanche', TRUE);

-- 234. Suco multinutritivo
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('43405171-3411-5eef-9098-1efffeb86124', 'Suco multinutritivo', 'Bebida · Diabetes', '["Suco de 1 laranja","1 maçã","50 g de cenoura","50 g de yacon","1 colher (chá) de farinha da casca de maracujá","150 ml de água","Adoçante e gelo a gosto"]', 'Bata no liquidificador o suco de laranja, a maçã e a cenoura com a água e coe.
Volte a bater com o yacon e a farinha da casca de maracujá.
Sirva sem coar, com adoçante e gelo a gosto.', NULL, NULL, 1, 120, 'cafe', TRUE);

-- 235. Suco de morango, pêssego e chia
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('ca8902cd-feba-53dd-998b-195b9ff3ce14', 'Suco de morango, pêssego e chia', 'Bebida · Estômago / Intestino', '["10 morangos","1 pêssego picado","1 colher (sopa) de sementes de chia","Suco de 1 limão","300 ml de água","Gelo"]', 'Bata todos os ingredientes no liquidificador e sirva a seguir.', NULL, NULL, 2, 55, 'lanche', TRUE);

-- 236. Iogurte de soja
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('611e9398-7da0-5844-ba1d-17fca22c0d31', 'Iogurte de soja', 'Bebida · Lactose', '["1 L de bebida à base de soja sem sabor","1/2 limão","5 colheres (sopa) de açúcar","1 caixa de gelatina sabor morango"]', 'Esprema o limão na bebida de soja e deixe talhar por 3 minutos.
Acrescente a gelatina e o açúcar.
Bata tudo no liquidificador.', NULL, NULL, NULL, NULL, 'cafe', TRUE);

-- 237. Suco de abacaxi, hortelã e linhaça
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('c6e97143-e5cc-5965-8f8f-7a8c4d0c4f90', 'Suco de abacaxi, hortelã e linhaça', 'Bebida · Fibras', '["1/2 abacaxi","300 ml de água","1 colher (sopa) de linhaça","Hortelã a gosto"]', 'Bata todos os ingredientes no liquidificador e sirva a seguir.', NULL, NULL, 2, NULL, 'lanche', TRUE);

-- 238. Gelado de framboesa com suplemento
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('860cc0c6-2da0-5486-ac33-47cd86f8b540', 'Gelado de framboesa com suplemento', 'Bebida · Insuficiência renal e hepática', '["50 g de polpa de framboesa congelada","1 colher (sopa) de leite desnatado","2 colheres (sopa) de mel","Gelo a gosto","150 ml de suplemento nutricional específico para insuficiência hepática","3 colheres (sopa) de iogurte desnatado"]', 'No liquidificador, bata a framboesa, o leite, o mel, o iogurte, o suplemento e o gelo.
Sirva a seguir.', NULL, NULL, 1, 376, 'lanche', TRUE);

-- 239. Suco energizante
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('6d7d7c79-4040-5959-95aa-7e25a6c8814f', 'Suco energizante', 'Bebida · Licopeno e polifenóis', '["1 xícara de chá-verde gelado","1/2 colher (café) de canela em pó","1 colher (café) de guaraná em pó","1 colher (sopa) de mel","1 copo de água de coco"]', 'Bata bem todos os ingredientes no liquidificador e sirva gelado.', NULL, NULL, 1, 41, 'lanche', TRUE);

-- 240. Suco de licopeno
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('7e848d38-3f15-5cb3-929c-241ccf913e25', 'Suco de licopeno', 'Bebida · Licopeno e polifenóis', '["1 xícara (chá) de tomate maduro picado","2 xícaras (chá) de goiaba vermelha picada","2 xícaras (chá) de melancia picada","5 xícaras (chá) de água","5 colheres (sopa) de açúcar","Gelo a gosto"]', 'Cozinhe o tomate e a goiaba com um pouco de água. Deixe esfriar e reserve.
Bata a melancia sem sementes no liquidificador.
Adicione o tomate e a goiaba cozidos e as 5 xícaras de água e bata bem.
Coe e acrescente o açúcar e o gelo.', NULL, NULL, 5, 78, 'lanche', TRUE);

-- 241. Suco de laranja e framboesa
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('04899e60-93f9-592e-b01c-3ca3e32b0f42', 'Suco de laranja e framboesa', 'Bebida · Mama', '["2 xícaras (chá) de framboesa congelada","3 xícaras (chá) de suco de laranja","Açúcar a gosto (opcional)"]', 'No liquidificador, bata a framboesa ainda congelada com o suco de laranja.
Se desejar, adoce. Sirva a seguir.', NULL, NULL, 4, 161, 'lanche', TRUE);

-- 242. Suco vermelho
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('66c7b4d7-9cc9-5347-b987-b8a0c220a045', 'Suco vermelho', 'Bebida · Próstata / Mama', '["1/2 beterraba descascada e picada","Suco de 2 laranjas","8 morangos","100 ml de água"]', 'Bata todos os ingredientes no liquidificador e sirva em seguida.', NULL, NULL, 2, 73, 'lanche', TRUE);

-- 243. Suco alaranjado
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('d54f9765-6183-5c55-8529-654475a4dbea', 'Suco alaranjado', 'Bebida · Pulmão', '["1 manga descascada e picada","1 cenoura picada","1 colher (sobremesa) de semente de gergelim","Gelo","Açúcar a gosto","500 ml de água de coco"]', 'Bata todos os ingredientes no liquidificador.
Sirva a seguir.', NULL, NULL, 2, 134, 'lanche', TRUE);

-- 244. Suco de manga com casca
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('c5da97f7-cfda-5c30-ad66-55f9c60362bc', 'Suco de manga com casca', 'Bebida · Pulmão', '["2 mangas maduras picadas com casca","1 limão (suco)","1 L de água","Gelo","Açúcar a gosto"]', 'Bata todos os ingredientes no liquidificador.
Coe e sirva a seguir.', NULL, NULL, 4, 87, 'lanche', TRUE);

-- 245. Milk-shake de chocolate com gengibre
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('369ee80e-77b0-59f4-902c-a3791dacd6a1', 'Milk-shake de chocolate com gengibre', 'Bebida · Quimioterapia e radioterapia', '["2 bolas de sorvete de chocolate","300 ml de leite","1 colher (chá) de gengibre ralado"]', 'Bata todos os ingredientes no liquidificador e sirva em seguida.', 'Indicações: náuseas e vômitos, dor e dificuldade para engolir.', NULL, 2, 342, 'lanche', TRUE);

-- 246. Suco de abacaxi, couve e água de coco
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('8205d758-0b62-5396-ba5e-1e5a9d0d35d3', 'Suco de abacaxi, couve e água de coco', 'Bebida · Tumores abdominais', '["2 folhas de couve-manteiga cortadas","2 fatias de abacaxi","300 ml de água de coco","300 ml de água gelada","Hortelã a gosto"]', 'Bata todos os ingredientes no liquidificador e coe, se necessário.
Sirva a seguir.', NULL, NULL, 2, 93, 'lanche', TRUE);

-- 247. Salada de verão
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('1714d5fc-0c4b-5020-b7cc-bdc2563b8833', 'Salada de verão', 'Receita prática e rápida para o dia a dia', '["100 g de rúcula","1 alface crespa pequena","250 g de couve-chinesa","1 maço de rabanete","5 fatias de pão torrado","2 dentes de alho","1 colher (sobremesa) de azeite","Azeite, limão e sal para temperar"]', 'Higienize bem as folhas, separe e corte em pedaços pequenos.
Limpe o rabanete e corte em rodelas. Corte o pão torrado em cubos.
Descasque e pique o alho e refogue no azeite. Adicione os cubos de pão e deixe tostar.
Numa tigela, coloque as folhas, o rabanete e o pão, misturando com cuidado.
Tempere com azeite, limão e sal.', NULL, 15, NULL, NULL, 'almoco', TRUE);

-- 248. Salada de legumes
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('1698c7cc-9cd1-553f-ab77-b2a03ae8c439', 'Salada de legumes', 'Receita prática e rápida para o dia a dia', '["1 couve-flor pequena","4 cenouras","1 aipo (salsão)","1 dente de alho","250 g de vagem","1 cebola-pérola pequena","Azeite, suco de 1 laranja, vinagre balsâmico, ervas finas e sal para temperar"]', 'Corte a couve-flor ao meio e higienize bem.
Descasque as cenouras e o aipo e corte em rodelas. Corte o alho em cubinhos e a vagem em pedaços menores.
Cozinhe a couve-flor, a cenoura, a vagem e o aipo.
Doure o alho e a cebola.
Misture todos os ingredientes com cuidado em uma tigela.
Tempere com azeite, suco de laranja, vinagre balsâmico, ervas finas e sal.', NULL, 15, NULL, NULL, 'almoco', TRUE);

-- 249. Salada de peito de frango com molho de mel
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('a398e8f7-b44c-594e-998e-f3932de5eaf7', 'Salada de peito de frango com molho de mel', 'Receita prática e rápida para o dia a dia', '["4 filés de frango","2 colheres (sobremesa) de azeite","Suco de 1 limão","2 colheres (sobremesa) de mel orgânico","1/2 alface americana","4 folhas de alface roxa","4 folhas de rúcula","150 g de tomate-cereja","Temperos a gosto","Azeite, suco de limão, vinagre balsâmico, ervas finas e sal para temperar"]', 'Higienize bem os filés de frango e deixe marinar com os temperos de sua preferência e o suco de limão misturado com o mel.
Higienize bem as folhas e os tomates-cereja.
Grelhe os filés em uma frigideira antiaderente aquecida.
Monte os pratos com os filés e a salada.
Tempere com azeite, suco de limão, vinagre balsâmico, ervas finas e sal.', NULL, 15, 4, NULL, 'almoco', TRUE);

-- 250. Salada de cogumelos com agrião
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('f02616ce-3523-5a79-a72e-0001148e5ac2', 'Salada de cogumelos com agrião', 'Receita prática e rápida para o dia a dia', '["400 g de cogumelos","Suco de 1 limão","4 tomates","1 maço pequeno de cebolinha","2 raminhos de agrião","Molho: iogurte natural, vinagre balsâmico, ervas a gosto (salsinha, orégano, ervas finas), 1 pitada de pimenta-do-reino e sal"]', 'Higienize bem os cogumelos, lamine e salpique com o suco de limão. Coloque numa tigela.
Lave os tomates, corte em fatias finas e junte aos cogumelos.
Lave bem a cebolinha e o agrião e misture todos os ingredientes com cuidado.
Para temperar, faça um molho de iogurte com vinagre balsâmico, ervas, pimenta-do-reino e sal.', NULL, 15, NULL, NULL, 'almoco', TRUE);

-- 251. Lombo com abacaxi
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('7e9a94de-0407-566f-8000-6e7e5423b302', 'Lombo com abacaxi', 'Receita prática e rápida para o dia a dia', '["800 g de lombo em cubos de 3 cm temperado com sal e pimenta-do-reino","2 colheres (sopa) de tempero para refogar (alho e cebola)","2 xícaras (chá) de caldo de legumes caseiro","2 xícaras (chá) de abacaxi em calda em cubos","1/2 xícara (chá) de tomate em cubinhos","1/2 xícara (chá) de azeite","Suco de 1/2 limão","Sal e pimenta-do-reino a gosto"]', 'Em uma panela antiaderente grande, refogue os cubos de lombo com o tempero por até 7 minutos.
Transfira para uma panela de pressão e cubra a carne com o caldo de legumes. Quando a panela começar a chiar, conte 6 minutos e desligue.
Enquanto isso, faça a salsa de abacaxi: misture em uma tigela o abacaxi, o tomate, o azeite e o suco de limão e tempere com sal e pimenta-do-reino.
Para servir, coloque uma porção generosa de lombo no centro do prato e despeje a salsa de abacaxi por cima.', NULL, 15, 4, NULL, 'almoco', TRUE);

-- 252. Escalopes à pizzaiolo
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('8df7c49b-b5a0-50ad-9b69-ba9b4a6f6936', 'Escalopes à pizzaiolo', 'Receita prática e rápida para o dia a dia', '["4 bifes bem finos de contrafilé temperados com sal e pimenta-do-reino","1 xícara (chá) de molho de tomate caseiro","1 xícara (chá) de muçarela de búfala ralada","1/2 xícara (chá) de azeitonas pretas picadas","1/4 de xícara (chá) de manjericão fresco picado","Óleo para untar"]', 'Preaqueça o forno em temperatura alta (250 °C).
Aqueça uma frigideira antiaderente grande e grelhe os bifes por 1 minuto de cada lado, em fogo alto.
Disponha os bifes em um refratário untado com um pouco de óleo e cubra com o molho de tomate.
Espalhe a muçarela, as azeitonas e o manjericão sobre cada bife.
Leve ao forno por 10 minutos, até o queijo derreter. Sirva imediatamente.', NULL, 15, 4, NULL, 'almoco', TRUE);

-- 253. Risoto de mignon ao vinho
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('4311932a-3b1a-5a51-ae08-4b9d3fc1daa6', 'Risoto de mignon ao vinho', 'Receita prática e rápida para o dia a dia', '["2 colheres (sopa) de tempero para refogar (alho e cebola)","2 xícaras (chá) de arroz arbóreo ou carnaroli","1/2 xícara (chá) de vinho tinto seco","4 xícaras (chá) de caldo de legumes caseiro","300 g de filé-mignon em tiras","1 cebola pequena fatiada em rodelas","Azeite para finalizar","Alecrim para decorar"]', 'Em uma panela de pressão grande, coloque o tempero para refogar e o arroz e frite por 1 minuto em fogo alto.
Acrescente o vinho, mexendo sempre, até evaporar o álcool (cerca de 1 minuto).
Acrescente o caldo de legumes, misture uma vez e feche a panela.
Assim que o pino começar a se mexer, abaixe o fogo, conte 23 minutos e desligue. Aguarde, com cuidado, até a panela perder completamente a pressão.
Enquanto isso, refogue o filé e a cebola em uma frigideira e reserve.
Abra a panela e misture o filé ao arroz, mexendo vigorosamente.
Quando todo o caldo tiver sido absorvido, finalize com uma colherada de azeite, acerte o tempero, decore com alecrim e sirva imediatamente.', NULL, NULL, 4, NULL, 'almoco', TRUE);

-- 254. Filé de frango glaceado com damasco
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('ba36e023-5ff5-50bf-bbad-2e84633f4757', 'Filé de frango glaceado com damasco', 'Receita prática e rápida para o dia a dia', '["4 filés de frango grossos temperados com sal e pimenta-do-reino","1 xícara (chá) de suco de laranja","1 xícara (chá) de caldo de legumes caseiro","1 colher (sopa) de amido de milho dissolvido em um pouco de água","3 colheres (sopa) de geleia de damasco","Azeite","Sal e pimenta-do-reino a gosto","Raspas de laranja e salsinha para decorar"]', 'Leve uma frigideira antiaderente grande ao fogo médio e grelhe os filés em um pouco de azeite por 3 minutos de cada lado.
Retire da frigideira e mantenha cobertos em um prato aquecido.
Na mesma frigideira, coloque o suco de laranja e o caldo de legumes. Acrescente o amido e misture bem.
Ferva por 8 minutos, até reduzir um pouco.
Adicione a geleia e cozinhe por mais 1 minuto. Tempere a gosto e desligue.
Coloque um filé em cada prato, regue com o molho e salpique raspas de laranja e salsinha.', NULL, 15, 4, NULL, 'almoco', TRUE);

-- 255. Linguado com molho de escarola
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('6bbf7613-552b-5f2a-b266-059f348a9bd3', 'Linguado com molho de escarola', 'Receita prática e rápida para o dia a dia', '["4 filés grandes de linguado temperados com sal e pimenta-do-reino","1 maço grande de escarola picada","2 colheres (sopa) de tempero para refogar (alho e cebola)","1 xícara (chá) de creme de leite fresco","Sal, pimenta-do-reino e noz-moscada a gosto","1/2 xícara (chá) de nozes picadas","Azeite"]', 'Em uma panela antiaderente grande, grelhe os filés com um pouco de azeite, dourando por 2 minutos de cada lado. Retire e mantenha cobertos em um prato aquecido.
Na mesma panela, refogue a escarola com o tempero até murchar, sem perder a cor.
Adicione o creme de leite e tempere com sal, pimenta-do-reino e noz-moscada.
Cozinhe até o molho engrossar um pouco, por 3 a 4 minutos.
Desligue, acrescente as nozes picadas e sirva sobre o linguado grelhado.', NULL, 15, 4, NULL, 'almoco', TRUE);

-- 256. Camarões com farofa de pão
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('7d8baad6-3f71-547d-a937-0657891e831c', 'Camarões com farofa de pão', 'Receita prática e rápida para o dia a dia', '["1 colher (sopa) de azeite de oliva","500 g de camarões limpos","2 colheres (sopa) de manteiga","2 xícaras (chá) de pão de forma esfarelado","1/2 xícara (chá) de tomates picados","2 dentes de alho bem picados","1 xícara (chá) de ervas frescas (por exemplo, salsinha, cebolinha e coentro)","Sal e pimenta dedo-de-moça picada a gosto"]', 'Em uma frigideira antiaderente, aqueça o azeite e grelhe os camarões rapidamente, 2 minutos de cada lado. Reserve.
Na mesma frigideira, derreta a manteiga (sem deixar queimar) e toste o pão por 1 minuto.
Junte o restante dos ingredientes e refogue até obter uma farofa dourada e úmida. Se necessário, regue com um fio de azeite.
Tempere com sal e pimenta dedo-de-moça.
Divida os camarões em quatro pratos e arrume a farofa por cima.', NULL, 15, 4, NULL, 'almoco', TRUE);

-- 257. Conchas recheadas com ricota
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('0d4bcfd4-c16f-5838-997a-57eae09e5856', 'Conchas recheadas com ricota', 'Receita prática e rápida para o dia a dia', '["3 L de água fervente","400 g de macarrão tipo concha","350 g de ricota fresca","1 cebola finamente picada","1/2 xícara (chá) de azeitonas verdes finamente picadas","4 colheres (sopa) de queijo parmesão ralado","Sal a gosto","2 xícaras (chá) de molho de tomate"]', 'Tempere a água fervente com sal, coloque o macarrão e cozinhe até ficar al dente.
Em uma tigela, misture bem a ricota, a cebola, as azeitonas e metade do parmesão. Tempere com sal.
Escorra o macarrão e recheie as conchas com a pasta de ricota.
Disponha as conchas em uma travessa, cubra com o molho e salpique o parmesão restante.', NULL, 15, 4, NULL, 'almoco', TRUE);

-- 258. Talharim de grão-de-bico à amalfitana
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('28a5fdd5-6fef-54d8-bc77-fb7baa752c0b', 'Talharim de grão-de-bico à amalfitana', 'Receita prática e rápida para o dia a dia', '["3 L de água fervente","400 g de talharim de grão-de-bico","1 lata de atum sólido","4 colheres (sopa) de azeite de oliva","8 filés de anchova","8 tomates grandes e maduros em cubos, sem sementes","1/4 de xícara (chá) de azeitonas pretas fatiadas","Sal a gosto"]', 'Tempere a água fervente com sal, coloque o macarrão e cozinhe até ficar al dente.
Escorra o atum e desmanche com a ajuda de um garfo. Reserve.
Leve uma panela antiaderente ao fogo médio e refogue as anchovas no azeite.
Junte os tomates e as azeitonas e cozinhe por 10 minutos. Prove e acrescente sal, se necessário.
Junte o atum reservado e misture bem.
Escorra o macarrão, junte o molho e sirva.', NULL, 15, 4, NULL, 'almoco', TRUE);

-- 259. Pera grelhada com calda de chocolate
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('46ef9c7e-1311-5150-aeee-b348ea8011dd', 'Pera grelhada com calda de chocolate', 'Receita prática e rápida para o dia a dia', '["4 peras com casca, sem miolo, fatiadas no sentido do comprimento","1 colher (sopa) de manteiga","1 colher (sopa) de açúcar demerara","250 g de chocolate meio amargo","Amêndoas picadas (opcional)"]', 'Derreta o chocolate em banho-maria ou no micro-ondas para fazer a calda. Reserve.
Leve ao fogo uma frigideira com a manteiga e o açúcar.
Adicione as fatias de pera e mexa delicadamente por 1 a 2 minutos, para envolver a fruta sem desmanchá-la.
Divida a pera em quatro pratos e despeje a calda de chocolate por cima.
Se quiser, salpique amêndoas picadas em cada porção.', NULL, 15, 4, NULL, 'lanche', TRUE);

-- 260. Merengue com manga e coco
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('8bff29ce-deec-5e50-b982-5334eb8cc2c6', 'Merengue com manga e coco', 'Receita prática e rápida para o dia a dia', '["2 claras","1 xícara (chá) de açúcar demerara","2 mangas Haden sem casca em cubinhos","1 xícara (chá) de coco fresco ralado","2 colheres (sopa) de hortelã fresca picadinha"]', 'Na batedeira, bata as claras até formarem uma espuma.
Adicione o açúcar e continue batendo até obter picos firmes (suspiro).
Em oito taças individuais, alterne camadas de suspiro, manga em cubos e coco ralado. Finalize com suspiro.
Leve à geladeira para firmar por, no mínimo, 3 horas.
Antes de servir, salpique 1/4 de colher (sopa) de hortelã em cada taça.', NULL, NULL, 8, NULL, 'lanche', TRUE);

-- 261. Romeu e Julieta chique
INSERT IGNORE INTO `recipes` (`id`, `title`, `description`, `ingredients`, `preparation`, `tips`, `prep_time`, `servings`, `calories`, `category`, `active_customer`) VALUES
('6f122325-71af-587f-a1f5-ec242f442397', 'Romeu e Julieta chique', 'Receita prática e rápida para o dia a dia', '["1 xícara (chá) de goiabada","1 xícara (chá) de água","1 xícara (chá) de ricota","2 colheres (sopa) de leite de amêndoas","2 colheres (sopa) de açúcar demerara","12 biscoitinhos de leite","1/2 xícara (chá) de amêndoas picadas"]', 'Coloque a goiabada e a água em uma panela média e leve ao fogo baixo, mexendo sempre até a goiabada derreter e formar uma calda. Desligue e reserve.
Bata no liquidificador a ricota, o açúcar e o leite de amêndoas até obter um creme macio. Se ficar muito espesso, acrescente mais uma colher (sopa) de leite.
No centro de cada prato, coloque um biscoito e, por cima, 1 colher (sopa) do creme de ricota.
Coloque outro biscoito e mais uma camada de creme. Termine com outro biscoito.
Despeje a calda de goiabada por cima de tudo, salpique as amêndoas e sirva.', NULL, 15, 4, NULL, 'lanche', TRUE);

COMMIT;
