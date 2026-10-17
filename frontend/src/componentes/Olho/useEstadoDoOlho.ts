import { useEffect, useState } from "react";

import type { EstadoDoOlho } from "./Olho";

/**
 * Quanto tempo o olho fica em `confirmando` ou `erro` antes de voltar a
 * `normal`, em ms: um pouco mais que o giro (600 ms) e a piscada (320 ms).
 */
export const DURACAO_DO_SINAL_DO_OLHO = 700;

/**
 * Estado do olho com volta automática a `normal`. O giro e a piscada só
 * disparam quando `data-estado` muda; voltar a `normal` depois da animação
 * faz o próximo sinal (por exemplo, um segundo gasto) animar de novo.
 * O mesmo sinal repetido durante a animação não a reinicia.
 */
export function useEstadoDoOlho(): [EstadoDoOlho, (estado: EstadoDoOlho) => void] {
  const [estado, definirEstado] = useState<EstadoDoOlho>("normal");

  useEffect(() => {
    if (estado === "normal") return;
    const prazo = setTimeout(() => definirEstado("normal"), DURACAO_DO_SINAL_DO_OLHO);
    return () => clearTimeout(prazo);
  }, [estado]);

  return [estado, definirEstado];
}
