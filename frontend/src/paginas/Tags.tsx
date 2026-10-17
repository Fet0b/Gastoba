import { useEffect, useMemo, useRef, useState } from "react";

import { ErroDaApiCliente } from "../api/cliente";
import { useGastos, useResumoPorTags } from "../api/consultas";
import type { MensagemDoAviso } from "../componentes/Aviso/Aviso";
import { DetalheDaTag } from "../componentes/Grafico/DetalheDaTag";
import { GraficoDeBarras } from "../componentes/Grafico/GraficoDeBarras";
import type { Navegacao } from "../componentes/Navegacao/telas";
import { Pagina } from "../componentes/Pagina/Pagina";
import { useEstadoDoOlho } from "../componentes/Olho/useEstadoDoOlho";
import { ValorAnimado } from "../componentes/ValorAnimado/ValorAnimado";
import { formatar } from "../dinheiro/dinheiro";
import { barraPelaChave, prepararBarras } from "../graficos/barras";
import { limites, periodoAtual } from "../periodo/periodo";
import { ehSemResposta, MENSAGEM_SERVIDOR_FORA } from "./mensagens";
import estilos from "./Tags.module.css";

/**
 * Tags: os gastos do mês por tag em barras. Clicar numa barra fixa a tag e abre, na própria
 * tela, os gastos dela; a seleção segue de um mês para o outro se a tag existir no mês novo.
 */
export function Tags({ navegacao }: { navegacao: Navegacao }) {
  const [periodo, definirPeriodo] = useState(periodoAtual);
  const [mensagem, definirMensagem] = useState<MensagemDoAviso | null>(null);
  const [selecionada, definirSelecionada] = useState<string | null>(null);
  const [estadoDoOlho, sinalizarOlho] = useEstadoDoOlho();

  const resumo = useResumoPorTags(limites(periodo));
  const gastos = useGastos(limites(periodo));
  // Durante a busca do mês novo os gastos guardados são os do mês anterior: não os usa.
  const gastosDoMes = gastos.carregando ? undefined : gastos.dados;

  const barras = useMemo(
    () => (resumo.dados ? prepararBarras(resumo.dados, undefined, gastosDoMes) : []),
    [resumo.dados, gastosDoMes],
  );
  const barraFixada = barraPelaChave(barras, selecionada);
  const conteudo = useRef<HTMLDivElement>(null);

  // O painel abre abaixo do gráfico e o foco fica na barra; esta região o anuncia (uma região
  // que já existe ao mudar o texto é lida; uma criada já com texto, nem sempre).
  const anuncio = barraFixada
    ? `${barraFixada.rotulo}: ${formatar(barraFixada.valor)}, ${barraFixada.percentual} do total` +
      (barraFixada.quantidade === undefined
        ? ""
        : `, ${barraFixada.quantidade} ${barraFixada.quantidade === 1 ? "gasto" : "gastos"}`) +
      ". Os gastos estão abaixo do gráfico."
    : "";

  // Fechar o painel devolve o foco à barra fixada (ou, se ela está dentro de "Outras" fechada, a "Outras").
  function fecharDetalhe() {
    const botao =
      conteudo.current?.querySelector<HTMLElement>("button[aria-pressed='true']") ??
      conteudo.current?.querySelector<HTMLElement>("button[aria-expanded]");
    botao?.focus();
    definirSelecionada(null);
  }

  // A tag fixada some no mês novo: limpa a seleção (e o painel fecha), sem erro.
  useEffect(() => {
    if (selecionada === null || resumo.carregando || resumo.dados === undefined) return;
    if (barraPelaChave(barras, selecionada) === undefined) definirSelecionada(null);
  }, [selecionada, barras, resumo.carregando, resumo.dados]);

  useEffect(() => {
    if (!resumo.erro) return;
    sinalizarOlho("erro");
    definirMensagem({
      tipo: "erro",
      texto: ehSemResposta(resumo.erro)
        ? MENSAGEM_SERVIDOR_FORA
        : (resumo.erro as ErroDaApiCliente).mensagem,
    });
  }, [resumo.erro]);

  return (
    <Pagina
      navegacao={navegacao}
      estadoDoOlho={estadoDoOlho}
      mensagem={mensagem}
      aoDispensarMensagem={() => definirMensagem(null)}
      controles={{ periodo, aoMudarPeriodo: definirPeriodo }}
    >
      <div className={estilos.conteudo} ref={conteudo}>
        <p className={estilos.somenteLeitor} role="status">
          {anuncio}
        </p>
        {resumo.dados && (
          <p className={estilos.total} role="group" aria-label="Total do mês em gastos">
            <span className={estilos.rotuloDoTotal}>Total do mês</span>
            <ValorAnimado valor={resumo.dados.total} className={estilos.valorDoTotal} />
          </p>
        )}
        <GraficoDeBarras
          resumo={resumo.dados}
          carregando={resumo.carregando}
          gastos={gastosDoMes}
          selecionada={selecionada}
          aoSelecionar={definirSelecionada}
        />
        {barraFixada && (
          <DetalheDaTag
            key={barraFixada.chave}
            barra={barraFixada}
            gastos={gastosDoMes}
            aoFechar={fecharDetalhe}
          />
        )}
      </div>
    </Pagina>
  );
}
