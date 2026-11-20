import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import { deCaminho, paraCaminho, type Rota } from "../../navegacao/rota";
import { mesDoPeriodo, periodoAtual, type Periodo } from "../../periodo/periodo";
import type { OpcoesDaIda, Tela } from "./telas";

const EVENTO_DA_ROTA = "gastoba:rota";

function assinar(aoMudar: () => void): () => void {
  window.addEventListener("popstate", aoMudar);
  window.addEventListener(EVENTO_DA_ROTA, aoMudar);
  return () => {
    window.removeEventListener("popstate", aoMudar);
    window.removeEventListener(EVENTO_DA_ROTA, aoMudar);
  };
}

function enderecoAtual(): string {
  return window.location.pathname + window.location.search;
}

function avisar(): void {
  window.dispatchEvent(new Event(EVENTO_DA_ROTA));
}

function mudarEndereco(endereco: string, substituir: boolean): void {
  if (endereco === enderecoAtual()) return;
  if (substituir) window.history.replaceState(null, "", endereco);
  else window.history.pushState(null, "", endereco);
  avisar();
}

/** Volta ao Início sem criar entrada no histórico (ao sair, para o próximo login começar nele). */
export function reiniciarARota(): void {
  mudarEndereco("/inicio", true);
}

/**
 * A rota atual, lida do endereço do navegador (History API, sem biblioteca de roteador). O voltar e
 * o avançar do navegador trocam a tela; um endereço fora do canônico é reescrito, sem entrada nova.
 */
export function useRota(): {
  rota: Rota;
  irPara: (tela: Tela, opcoes?: OpcoesDaIda) => void;
} {
  const endereco = useSyncExternalStore(assinar, enderecoAtual);
  const rota = useMemo(() => {
    const [caminho, ...resto] = endereco.split("?");
    return deCaminho(caminho, resto.length === 0 ? "" : `?${resto.join("?")}`);
  }, [endereco]);

  useEffect(() => {
    if (!rota.canonico) mudarEndereco(paraCaminho(rota.tela, rota), true);
  }, [rota]);

  const irPara = useCallback((tela: Tela, opcoes?: OpcoesDaIda) => {
    // O mês acompanha a ida entre telas mensais; sem a URL, cada tela começa no mês atual.
    const atual = deCaminho(window.location.pathname, window.location.search);
    mudarEndereco(
      paraCaminho(tela, {
        mes: atual.mes,
        dataDoMovimento: opcoes?.dataDoMovimento,
        vistaDeTransacoes: opcoes?.vistaDeTransacoes,
      }),
      false,
    );
  }, []);

  return { rota, irPara };
}

/**
 * O mês da página, guardado em `?mes=AAAA-MM`: trocar de mês empilha uma entrada no histórico
 * (ou a substitui, com `substituir`). Sem o parâmetro, vale o mês atual.
 */
export function usePeriodoDaRota(): [Periodo, (periodo: Periodo, opcoes?: { substituir?: boolean }) => void] {
  const endereco = useSyncExternalStore(assinar, enderecoAtual);
  const doEndereco = useMemo(() => deCaminho("/inicio", endereco.includes("?") ? `?${endereco.split("?")[1]}` : "").mes, [endereco]);
  const periodo = doEndereco ?? periodoAtual();
  const definir = useCallback((novo: Periodo, opcoes?: { substituir?: boolean }) => {
    const parametros = new URLSearchParams(window.location.search);
    if (parametros.get("mes") === mesDoPeriodo(novo)) return;
    parametros.set("mes", mesDoPeriodo(novo));
    mudarEndereco(`${window.location.pathname}?${parametros.toString()}`, opcoes?.substituir === true);
  }, []);
  return [periodo, definir];
}
