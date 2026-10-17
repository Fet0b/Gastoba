# Alinhamento da tela Início

Problema: a grade com duas colunas põe o resumo curto e cinco metas altas na mesma linha, deixando grande espaço vazio antes do gráfico.

Escopo: somente CSS da cópia pública e imagem do README. O resumo e as metas passam a ocupar a largura disponível, seguidos por gráfico e últimos gastos em duas colunas no desktop. Os cinco medidores repartem a linha sem colunas vazias. Em telas estreitas mantém-se a ordem de leitura e não há rolagem horizontal. Nenhum dado, lógica, endpoint ou deploy muda.

Aceite e verificação: conferir geometria real no navegador em 1440px e 375px, sem sobreposição ou overflow; cinco metas alinhadas no desktop; resumo seguido por metas sem espaço vazio causado pela altura da coluna vizinha. Executar testes existentes de Início/Metas, tipos e build. Capturar novamente a interface real com dados fictícios, sem CSS injetado. Não criar teste unitário que apenas replique regras CSS.

Revisão do plano: alteração mínima de apresentação, preserva arquitetura, dinheiro e leitura acessível. Resultados: 71 testes existentes de Início/Metas passaram; tipos e build aprovados. Conferência real no Chromium em 1440, 375 e 320px sem overflow horizontal. Em desktop os cinco cartões têm y=359px e largura ~207,6px, todos na mesma linha. Em celular, a última meta sem par ocupa a largura da grade. Captura desktop substituída com dados fictícios; nenhuma regra CSS foi injetada para a imagem.
