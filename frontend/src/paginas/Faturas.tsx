import { Cartao } from "../componentes/Cartao/Cartao";
import { EstadoVazio } from "../componentes/EstadoVazio/EstadoVazio";
import type { Navegacao } from "../componentes/Navegacao/telas";
import { Pagina } from "../componentes/Pagina/Pagina";
import { useEstadoDoOlho } from "../componentes/Olho/useEstadoDoOlho";
import estilos from "./Faturas.module.css";

/**
 * Faturas: tela "em breve". O cartão é só um desenho, com textos fixos de ilustração: não consulta
 * a API, não faz conta e nada daqui entra em totais, gráficos ou métricas.
 */
export function Faturas({ navegacao }: { navegacao: Navegacao }) {
  const [estadoDoOlho] = useEstadoDoOlho();

  return (
    <Pagina
      navegacao={navegacao}
      estadoDoOlho={estadoDoOlho}
      mensagem={null}
      aoDispensarMensagem={() => undefined}
    >
      <div className={estilos.conteudo}>
        <h2 className={estilos.titulo}>Faturas</h2>
        <EstadoVazio
          icone="faturas"
          titulo="Faturas chega em breve"
          texto="O cartão abaixo é apenas um exemplo."
        />

        <Cartao variante="destaque" className={estilos.cartao}>
          <div role="group" aria-label="Exemplo de cartão de fatura" className={estilos.exemplo}>
            <span className={estilos.marca}>Exemplo</span>
            <div className={estilos.linha}>
              <span>Gasto</span>
              <span className="valor">R$ 1.200,00</span>
            </div>
            <svg className={estilos.barra} viewBox="0 0 100 4" aria-hidden="true" focusable="false">
              <rect width="100" height="4" rx="2" fill="currentColor" opacity="0.3" />
              <rect width="40" height="4" rx="2" fill="currentColor" />
            </svg>
            <div className={estilos.linha}>
              <span>Limite</span>
              <span className="valor">R$ 3.000,00</span>
            </div>
          </div>
        </Cartao>
      </div>
    </Pagina>
  );
}
