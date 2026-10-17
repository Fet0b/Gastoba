import { useEffect, useId, useState } from "react";

import { ErroDaApiCliente } from "../api/cliente";
import {
  useCategorias,
  useDefinirMeta,
  useGastos,
  useMetas,
  useProgressoDasMetas,
  useRemoverMeta,
} from "../api/consultas";
import type { MensagemDoAviso } from "../componentes/Aviso/Aviso";
import type { Navegacao } from "../componentes/Navegacao/telas";
import { Pagina } from "../componentes/Pagina/Pagina";
import { CartaoDeMeta } from "../componentes/Metas/CartaoDeMeta";
import { DivisaoDaRenda } from "../componentes/Metas/DivisaoDaRenda";
import { useEstadoDoOlho } from "../componentes/Olho/useEstadoDoOlho";
import { formatar } from "../dinheiro/dinheiro";
import { gastoAteHoje } from "../projecao/projecao";
import { hojeLocal, limites, mesDoPeriodo, periodoAtual } from "../periodo/periodo";
import { Destaque } from "../componentes/Destaque/Destaque";
import { ProjecaoDoMes } from "../componentes/Projecao/ProjecaoDoMes";
import estilos from "./Orcamento.module.css";
import { ehSemResposta, MENSAGEM_SERVIDOR_FORA } from "./mensagens";

function textoDoErro(erro: unknown): string {
  return ehSemResposta(erro) ? MENSAGEM_SERVIDOR_FORA : (erro as ErroDaApiCliente).mensagem;
}

/**
 * Aba Orçamento (as metas): a porcentagem da renda do mês para cada categoria. Mostra a renda
 * do mês (a soma dos ganhos), o quanto cada percentual vale em reais, o
 * progresso de cada meta e a soma, que nunca passa de 100%.
 */
export function Orcamento({ navegacao }: { navegacao: Navegacao }) {
  const [periodo, definirPeriodo] = useState(periodoAtual);
  const [editando, definirEditando] = useState<string | null>(null);
  // A categoria cujo salvar falhou: o erro da API só aparece no cartão dela.
  const [categoriaComErro, definirCategoriaComErro] = useState<string | null>(null);
  const [mensagem, definirMensagem] = useState<MensagemDoAviso | null>(null);
  const [estadoDoOlho, sinalizarOlho] = useEstadoDoOlho();
  const idTitulo = useId();

  const categorias = useCategorias();
  const metas = useMetas();
  const progresso = useProgressoDasMetas(mesDoPeriodo(periodo));
  const gastosDoMes = useGastos(limites(periodo));
  const definir = useDefinirMeta();
  const remover = useRemoverMeta();

  function avisar(tipo: MensagemDoAviso["tipo"], texto: string): void {
    definirMensagem({ tipo, texto });
  }

  function avisarErro(erro: unknown): void {
    sinalizarOlho("erro");
    avisar("erro", textoDoErro(erro));
  }

  useEffect(() => {
    if (categorias.erro) avisarErro(categorias.erro);
  }, [categorias.erro]);
  useEffect(() => {
    if (metas.erro) avisarErro(metas.erro);
  }, [metas.erro]);
  useEffect(() => {
    if (gastosDoMes.erro) avisarErro(gastosDoMes.erro);
  }, [gastosDoMes.erro]);
  useEffect(() => {
    if (progresso.erro) avisarErro(progresso.erro);
  }, [progresso.erro]);
  // Um erro de rede ao salvar ou remover vai ao aviso; os da API ficam junto ao campo.
  useEffect(() => {
    if (definir.erro) {
      sinalizarOlho("erro");
      if (ehSemResposta(definir.erro)) avisar("erro", MENSAGEM_SERVIDOR_FORA);
    }
  }, [definir.erro]);
  useEffect(() => {
    if (remover.erro) avisarErro(remover.erro);
  }, [remover.erro]);

  const percentuais = new Map(metas.dados?.map((meta) => [meta.categoria, meta.percentual]));
  const progressos = new Map(progresso.dados?.metas.map((p) => [p.categoria, p]));
  const somaTotal = [...percentuais.values()].reduce((soma, percentual) => soma + percentual, 0);
  const renda = progresso.dados?.renda ?? "0.00";
  const hoje = hojeLocal();
  const gastoAteAgora = gastoAteHoje({ gastos: gastosDoMes.dados ?? [], periodo, hoje });

  async function salvar(categoria: string, percentual: number): Promise<void> {
    definirCategoriaComErro(categoria);
    const salva = await definir.executar({ categoria, percentual });
    if (salva) {
      sinalizarOlho("confirmando");
      avisar("confirmacao", "Meta salva.");
      definirEditando(null);
    }
  }

  async function removerMeta(categoria: string): Promise<boolean> {
    const removida = await remover.executar(categoria);
    if (!removida) return false;
    avisar("confirmacao", "Meta removida.");
    return true;
  }

  return (
    <Pagina
      navegacao={navegacao}
      estadoDoOlho={estadoDoOlho}
      mensagem={mensagem}
      aoDispensarMensagem={() => definirMensagem(null)}
      controles={{ periodo, aoMudarPeriodo: definirPeriodo }}
    >
      <div className={estilos.conteudo}>
        <div className={estilos.introducao}>
          <h2 id={idTitulo} className={estilos.titulo}>
            Metas
          </h2>
          <p className={estilos.texto}>
            Defina quanto da sua renda do mês cada categoria pode usar. A renda é a soma dos ganhos
            registrados no mês.
          </p>
        </div>

        <section className={estilos.coluna} aria-labelledby={idTitulo}>
          <div className={estilos.faixa}>
            <Destaque rotulo="Renda do mês" valor={formatar(renda)} />
            <Destaque
              rotulo="Gasto até agora"
              valor={gastosDoMes.dados === undefined ? "—" : formatar(gastoAteAgora)}
            />
            <ProjecaoDoMes
              periodo={periodo}
              gastos={gastosDoMes.dados}
              renda={renda}
              hoje={hoje}
              carregando={gastosDoMes.carregando}
              erro={gastosDoMes.erro !== undefined && gastosDoMes.erro !== null}
            />
          </div>
          <p className={estilos.soma}>
            Metas somam {somaTotal}% (sobram {100 - somaTotal}%)
          </p>

          {categorias.dados !== undefined && metas.dados !== undefined && (
            <DivisaoDaRenda categorias={categorias.dados} metas={metas.dados} renda={renda} />
          )}

          {categorias.dados === undefined ? (
            <p className={estilos.estado}>
              {categorias.carregando
                ? "Carregando as categorias…"
                : "Não foi possível carregar as categorias."}
            </p>
          ) : (
            <ul className={estilos.cartoes} aria-label="Metas por categoria">
              {categorias.dados.map((categoria, indice) => {
                const percentual = percentuais.get(categoria.codigo);
                return (
                  <CartaoDeMeta
                    key={categoria.codigo}
                    indice={indice}
                    categoria={categoria}
                    percentual={percentual}
                    progresso={progressos.get(categoria.codigo)}
                    renda={renda}
                    somaDasOutras={somaTotal - (percentual ?? 0)}
                    editando={editando === categoria.codigo}
                    aoEditar={() => definirEditando(categoria.codigo)}
                    aoCancelar={() => definirEditando(null)}
                    aoSalvar={(valor) => salvar(categoria.codigo, valor)}
                    aoRemover={() => removerMeta(categoria.codigo)}
                    erro={
                      categoriaComErro === categoria.codigo &&
                      editando === categoria.codigo &&
                      definir.erro &&
                      !ehSemResposta(definir.erro)
                        ? textoDoErro(definir.erro)
                        : undefined
                    }
                    salvando={definir.pendente && editando === categoria.codigo}
                  />
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Pagina>
  );
}
