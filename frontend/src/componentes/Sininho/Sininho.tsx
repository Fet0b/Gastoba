import { useEffect, useId, useRef, useState } from "react";

import { useInvestimentos, useResgatesSemDestinacao } from "../../api/consultas";
import { formatar } from "../../dinheiro/dinheiro";
import { posicaoSemCaixinhas } from "../../investimentos/destinacoes";
import { dataParaExibicao } from "../../periodo/periodo";
import { Icone } from "../Icone/Icone";
import { Titulo } from "../Titulo/Titulo";
import estilos from "./Sininho.module.css";

/**
 * O sininho do canto superior direito: avisa os saques de investimento (resgates) ainda sem tag.
 * Sem tag o resgate não pode pagar uma compra e pode ser outra coisa (o vencimento de uma renda
 * fixa, por exemplo); a pessoa decide. O aviso some sozinho quando o resgate recebe tag.
 */
export function Sininho({ aoVerResgate }: { aoVerResgate: (data: string) => void }) {
  const idDaLista = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const [aberto, definirAberto] = useState(false);
  const resgates = useResgatesSemDestinacao();
  const posicoes = useInvestimentos().dados;
  const itens = resgates.dados ?? [];
  // Resgate já ligado a posição sem caixinhas: não há destinação a definir, só a natureza a confirmar.
  const soConfirmar = (resgate: (typeof itens)[number]): boolean => {
    if (resgate.tipo !== "resgate" || !resgate.investimento_id || !Array.isArray(posicoes)) return false;
    const posicao = posicoes.find((p) => p.id === resgate.investimento_id);
    return posicao !== undefined && Array.isArray(posicao.destinacoes) && posicaoSemCaixinhas(posicao);
  };
  const quantidade = itens.length;

  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key !== "Escape") return;
      definirAberto(false);
      raiz.current?.querySelector("button")?.focus();
    }
    function aoClicarFora(evento: MouseEvent) {
      if (!raiz.current?.contains(evento.target as Node)) definirAberto(false);
    }
    document.addEventListener("keydown", aoTeclar);
    document.addEventListener("mousedown", aoClicarFora);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("mousedown", aoClicarFora);
    };
  }, [aberto]);

  const vencimentos = itens.filter(i => i.tipo === "vencimento").length;
  const resgatesComuns = quantidade - vencimentos;
  const partes = [
    ...(vencimentos ? [`${vencimentos} ${vencimentos === 1 ? "vencimento" : "vencimentos"} sem caixinha`] : []),
    ...(resgatesComuns ? [`${resgatesComuns} ${resgatesComuns === 1 ? "resgate" : "resgates"} sem caixinha`] : []),
  ];
  const resumo = quantidade ? `Avisos: ${partes.join(" e ")}` : "Avisos: nenhum";

  return (
    <div className={estilos.sininho} ref={raiz} data-sininho="">
      <button
        type="button"
        className={estilos.botao}
        aria-label={resumo}
        aria-expanded={aberto}
        aria-controls={idDaLista}
        onClick={() => definirAberto(!aberto)}
      >
        <Icone nome="sino" tamanho={22} />
        {quantidade > 0 && (
          <span className={estilos.contador} data-contador="" aria-hidden="true">
            {quantidade}
          </span>
        )}
      </button>
      {/* Anuncia a chegada de um aviso sem mover o foco. */}
      <span className="visualmente-oculto" role="status">
        {quantidade > 0 ? resumo : ""}
      </span>
      <div id={idDaLista} className={estilos.painel} hidden={!aberto}>
        <Titulo nivel="secao" como="h2" className={estilos.titulo}>Resgates e vencimentos sem caixinha</Titulo>
        {quantidade === 0 ? (
          <p className={estilos.vazio}>Nenhum aviso por enquanto.</p>
        ) : (
          <>
            <p className={estilos.explicacao}>
              {itens.every(soConfirmar)
                ? "Confirme se cada entrada é um vencimento. A posição não tem caixinhas, então não há destinação a definir."
                : "Defina a destinação de cada entrada. A classificação como vencimento é confirmada por você."}
            </p>
            <ul className={estilos.lista}>
              {itens.map((resgate) => (
                <li key={resgate.id}>
                  <button
                    type="button"
                    className={estilos.item}
                    onClick={() => {
                      definirAberto(false);
                      aoVerResgate(resgate.data);
                    }}
                  >
                    <span className={estilos.valor}>{formatar(resgate.valor)}</span>
                    <span className={estilos.data}>{resgate.tipo === "vencimento" ? "venceu em " : "resgatado em "}{dataParaExibicao(resgate.data)}</span>
                    <span className={estilos.descricao}>{resgate.investimento_nome ?? resgate.descricao}</span>
                    <span>{soConfirmar(resgate) ? "Confirmar natureza →" : "Definir destinação →"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
