import { GrupoDeOpcoes } from "../Campo/GrupoDeOpcoes";
import { useEffect, useState } from "react";
import { useDefinirCorDaDestinacao, useRemoverCorDaDestinacao } from "../../api/consultas";
import { ErroDaApiCliente } from "../../api/cliente";
import type { CorDaDestinacao as CodigoDaCor } from "../../api/tipos";
import { HEX_DA_COR, NOMES_DAS_CORES } from "../../investimentos/cores";
import { useCorDaDestinacao } from "./CoresDasDestinacoes";
import estilos from "./CorDaDestinacao.module.css";
export function CorDaDestinacao({ tag, cor }: {
  tag: string;
  cor: CodigoDaCor | null;
}) {
  const corDaDestinacao = useCorDaDestinacao();
  useEffect(() => definirEscolhida(cor), [cor]);
  const [aberta, definirAberta] = useState(false);
  const [escolhida, definirEscolhida] = useState(cor);
  const salvar = useDefinirCorDaDestinacao(), remover = useRemoverCorDaDestinacao();
  const pendente = salvar.pendente || remover.pendente;
  const erro = salvar.erro ?? remover.erro;
  async function escolher(codigo: CodigoDaCor | null) { const resultado = codigo === null ? await remover.executar(tag) : await salvar.executar({ tag, cor: codigo }); if (resultado !== undefined)
    definirEscolhida(codigo); }
  return <div className={estilos.seletor}><button className={estilos.botao} type="button" aria-expanded={aberta} onClick={() => definirAberta(!aberta)}><span className={estilos.amostra} style={{ backgroundColor: corDaDestinacao(tag, escolhida) }} aria-hidden="true"/><span className="visualmente-oculto">Cor de «{tag}»</span></button>{aberta && <GrupoDeOpcoes legenda={`Cor de «${tag}»`} valor={escolhida??"automatica"} aoMudar={valor=>void escolher(valor==="automatica"?null:valor as CodigoDaCor)} desabilitado={pendente} opcoes={[{valor:"automatica",titulo:"Automática"},...Object.keys(HEX_DA_COR).map(codigo=>({valor:codigo,titulo:NOMES_DAS_CORES[codigo as CodigoDaCor]}))]} />}{erro != null && <span role="alert">{erro instanceof ErroDaApiCliente ? erro.mensagem : "Não foi possível salvar a cor."}</span>}</div>;
}
