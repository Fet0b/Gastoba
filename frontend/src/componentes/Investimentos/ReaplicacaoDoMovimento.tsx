import { useEffect, useRef, useState } from "react";
import { useRemoverReaplicacao } from "../../api/consultas";
import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import type { MovimentoDeInvestimento, ReaplicacaoDeResgate } from "../../api/tipos";
import { formatar } from "../../dinheiro/dinheiro";
import { Botao } from "../Botao/Botao";
import { DialogoDeConfirmacao } from "../DialogoDeConfirmacao/DialogoDeConfirmacao";
import { DialogoDeReaplicacao } from "./DialogoDeReaplicacao";

export function ReaplicacaoDoMovimento({movimento, reaplicacao, carregando, aoAvisar}: {
  movimento: MovimentoDeInvestimento; reaplicacao?: ReaplicacaoDeResgate; carregando: boolean; aoAvisar: (texto:string)=>void;
}) {
  const botao=useRef<HTMLButtonElement>(null);
  const [aberto,definirAberto]=useState(false);
  const [confirmando,definirConfirmando]=useState(false);
  const remover=useRemoverReaplicacao();
  const restaurarFoco=useRef(false);
  useEffect(()=>{
    if(restaurarFoco.current && !carregando && !aberto && !confirmando){
      botao.current?.focus();restaurarFoco.current=false;
    }
  },[carregando,aberto,confirmando,reaplicacao]);
  async function desfazer() {
    if(reaplicacao && await remover.executar(reaplicacao.id)){restaurarFoco.current=true;definirConfirmando(false);aoAvisar("Reaplicação desfeita. O aporte voltou a consumir a meta.");}
  }
  return <div>
    {reaplicacao && <p>Reaplicação: {formatar(reaplicacao.valor)}</p>}
    <Botao ref={botao} variante="terciario" disabled={carregando} aria-label={`${reaplicacao?"Desfazer reaplicação":"Vincular resgate"}: ${movimento.descricao}`} onClick={()=>reaplicacao?definirConfirmando(true):definirAberto(true)}>{reaplicacao?"Desfazer reaplicação":"Vincular resgate"}</Botao>
    {aberto && <DialogoDeReaplicacao aporte={movimento} devolverFocoPara={botao} aoFechar={()=>definirAberto(false)} aoConfirmar={()=>{restaurarFoco.current=true;definirAberto(false);aoAvisar("Reaplicação confirmada.");}}/>}
    <DialogoDeConfirmacao aberto={confirmando} titulo="Desfazer reaplicação?" descricao="O valor volta a consumir a meta no mês do aporte. Os movimentos e saldos permanecem iguais." rotuloDaAcao="Confirmar remoção da reaplicação" pendente={remover.pendente} devolverFocoPara={botao} erro={remover.erro?remover.erro instanceof ErroDaApiCliente?remover.erro.mensagem:MENSAGEM_SEM_RESPOSTA:undefined} aoCancelar={()=>definirConfirmando(false)} aoConfirmar={()=>void desfazer()}/>
  </div>;
}
