import { useRef, useState } from "react";
import { useRevisaoDaBolsa } from "../../api/consultas";
import { Botao } from "../Botao/Botao";
import { Cartao } from "../Cartao/Cartao";
import { Titulo } from "../Titulo/Titulo";
import { RevisaoDaBolsa } from "./RevisaoDaBolsa";
import estilos from "./RevisaoDaBolsa.module.css";

type Props = { habilitada: boolean; aoAvisar: (texto: string) => void };

/** Cartão-resumo que abre a Revisão da bolsa; só aparece quando há o que conferir. */
export function ResumoDaRevisaoDaBolsa({ habilitada, aoAvisar }: Props) {
  const consulta = useRevisaoDaBolsa(habilitada);
  const [aberta, mudarAberta] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const dados = consulta.dados;
  if (!habilitada) return null;
  const lancamentos = (dados?.propostas ?? []).reduce((n, p) => n + p.bruto.length + p.taxas.length, 0);
  // Operação sem lançamento é só informação (a compra pode ter sido paga por conta não conectada);
  // só pede atenção o que a pessoa pode ligar ou o lançamento que ficou sem operação.
  const precisaDeAtencao = !!dados && (dados.propostas.length > 0 || dados.sem_par.some(i => i.transacao_id !== null));
  if (!precisaDeAtencao && !aberta) return null;
  return <Cartao como="section" variante="padrao" aria-label="Revisão da bolsa">
    <Titulo nivel="cartao">Revisão da bolsa</Titulo>
    <p className={estilos.apoio}>{lancamentos > 0
      ? `${lancamentos} ${lancamentos === 1 ? "lançamento da conta já aparece" : "lançamentos da conta já aparecem"} em Investimentos. Ligue-${lancamentos === 1 ? "o" : "os"} às operações da corretora para não contar o mesmo dinheiro duas vezes.`
      : "Há lançamentos da conta sem operação correspondente na corretora. Confira para não contar o mesmo dinheiro duas vezes."}</p>
    <div className={estilos.acoes}><Botao ref={botao} variante="secundario" onClick={() => mudarAberta(true)}>Revisar</Botao></div>
    {aberta && <RevisaoDaBolsa aoAvisar={aoAvisar} aoFechar={() => { mudarAberta(false); botao.current?.focus(); }} />}
  </Cartao>;
}
