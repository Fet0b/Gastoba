import { useId, useState, type RefObject } from "react";
import { useConfirmarReaplicacao, useResgatesParaReaplicar } from "../../api/consultas";
import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import type { MovimentoDeInvestimento } from "../../api/tipos";
import { deCentavos, formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { dataParaExibicao } from "../../periodo/periodo";
import { Botao } from "../Botao/Botao";
import { CampoDeValor } from "../Campo/CampoDeValor";
import { GrupoDeOpcoes } from "../Campo/GrupoDeOpcoes";
import { Dialogo } from "../Dialogo/Dialogo";
import { Esqueleto } from "../Esqueleto/Esqueleto";
import { EstadoDeErro } from "../EstadoDeErro/EstadoDeErro";

export function DialogoDeReaplicacao({aporte, aoFechar, aoConfirmar, devolverFocoPara}: {
  aporte: MovimentoDeInvestimento; aoFechar: () => void; aoConfirmar: () => void;
  devolverFocoPara: RefObject<HTMLButtonElement | null>;
}) {
  const id = useId();
  const candidatos = useResgatesParaReaplicar(aporte.id);
  const confirmar = useConfirmarReaplicacao();
  const [resgateId, definirResgateId] = useState("");
  const [valor, definirValor] = useState("0.00");
  const escolhido = candidatos.dados?.find(r => r.id === resgateId);
  const limite = escolhido ? (paraCentavos(escolhido.disponivel) < paraCentavos(aporte.valor) ? paraCentavos(escolhido.disponivel) : paraCentavos(aporte.valor)) : 0n;
  const valido = escolhido !== undefined && paraCentavos(valor) > 0n && paraCentavos(valor) <= limite;
  const erro = confirmar.erro ?? candidatos.erro;
  async function enviar() {
    if (!valido || confirmar.pendente) return;
    if (await confirmar.executar({aporte_id:aporte.id,resgate_id:resgateId,valor})) aoConfirmar();
  }
  return <Dialogo aberto titulo="Vincular resgate ao aporte" aoFechar={aoFechar} bloqueado={confirmar.pendente} devolverFocoPara={devolverFocoPara} rodape={<>
    <Botao variante="secundario" disabled={confirmar.pendente} onClick={aoFechar}>Cancelar</Botao>
    <Botao variante="primario" disabled={!valido || confirmar.pendente} aria-describedby={!valido?id:undefined} onClick={() => void enviar()}>Confirmar reaplicação</Botao>
  </>}>
    <p>{aporte.descricao}: {formatar(aporte.valor)}</p>
    <p>Confirme qual resgate financiou este aporte. Somente o valor reaplicado deixa de consumir a meta Liberdade financeira.</p>
    {candidatos.carregando && <Esqueleto rotulo="Consultando resgates…" linhas={2} />}
    {candidatos.dados?.length === 0 && <p>Nenhum resgate elegível disponível. Associe as operações a investimentos distintos e confira as datas.</p>}
    <GrupoDeOpcoes legenda="Escolha o resgate" valor={resgateId} aoMudar={id => {
      definirResgateId(id);
      const resgate=candidatos.dados?.find(r=>r.id===id);
      if(resgate)definirValor(deCentavos(paraCentavos(resgate.disponivel)<paraCentavos(aporte.valor)?paraCentavos(resgate.disponivel):paraCentavos(aporte.valor)));
    }} opcoes={(candidatos.dados??[]).map(r=>({valor:r.id,titulo:r.descricao,descricao:`${r.investimento_nome}, ${dataParaExibicao(r.data)}, Disponível ${formatar(r.disponivel)}`}))} />
    <CampoDeValor rotulo="Valor reaplicado" valor={valor} aoMudar={definirValor} />
    {escolhido && <p>Até {formatar(deCentavos(limite))}. O restante do aporte continua na meta.</p>}
    {!valido && <p id={id}>{escolhido ? "Informe um valor positivo dentro do disponível." : "Escolha o resgate para confirmar a reaplicação."}</p>}
    {erro != null && <EstadoDeErro mensagem={erro instanceof ErroDaApiCliente ? erro.mensagem : MENSAGEM_SEM_RESPOSTA} />}
  </Dialogo>;
}
