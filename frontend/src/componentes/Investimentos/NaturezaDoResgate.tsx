import { Seletor } from "../Campo/Seletor";
import { useState } from "react";
import { useClassificarNaturezaDoResgate } from "../../api/consultas";
import { ErroDaApiCliente } from "../../api/cliente";
import type { MovimentoDeInvestimento } from "../../api/tipos";
import { Botao } from "../Botao/Botao";

export function NaturezaDoResgate({movimento}:{movimento:MovimentoDeInvestimento}) {
 const [escolha, escolher] = useState(movimento.vencimento_confirmado ? "vencimento" : "resgate");
 const [confirmado, marcarConfirmado] = useState(false);
 const confirmar = useClassificarNaturezaDoResgate();
 return <div>
  <p>Identifique se esta entrada veio de um resgate ou do vencimento do título.</p>
  <Seletor rotulo="Natureza da entrada" valor={escolha} aoMudar={escolher} opcoes={[{valor:"resgate",rotulo:"Resgate"},{valor:"vencimento",rotulo:"Vencimento"}]} />
  <Botao variante="secundario" disabled={confirmar.pendente} onClick={async()=>{ const feito = await confirmar.executar({id:movimento.id,tipo:escolha as "resgate"|"vencimento"}); marcarConfirmado(feito === true); }}>Confirmar natureza da entrada</Botao>
  {confirmado && <p role="status">Natureza da entrada confirmada.</p>}
  {confirmar.erro != null && <p role="alert">{confirmar.erro instanceof ErroDaApiCliente ? confirmar.erro.mensagem : "Não foi possível confirmar."}</p>}
 </div>;
}
