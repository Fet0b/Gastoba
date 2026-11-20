import { useState } from "react";

import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import {
  useCategorias,
  useDestinacoesCadastradas,
  useDefinirGuardadoNasMetas,
  useGuardadoNasMetas,
  useInvestimentos,
} from "../../api/consultas";
import type { CaixinhaMarcada, GuardadoNasMetas as Configuracao } from "../../api/tipos";
import { rotuloDeExibicao } from "../../texto/rotulo";
import type { MensagemDoAviso } from "../Aviso/Aviso";
import { invalidar } from "../../api/useConsulta";
import { Botao } from "../Botao/Botao";
import { Caixa } from "../Campo/Caixa";
import { Cartao } from "../Cartao/Cartao";
import { EstadoDeErro } from "../EstadoDeErro/EstadoDeErro";
import { EstadoVazio } from "../EstadoVazio/EstadoVazio";
import { Esqueleto } from "../Esqueleto/Esqueleto";
import { SeletorMultiplo } from "../SeletorMultiplo/SeletorMultiplo";
import { Titulo } from "../Titulo/Titulo";
import estilos from "./GuardadoNasMetas.module.css";

type Propriedades = {
  /** Sem a gestão de investimentos não há caixinhas: o cartão só explica. */
  gestaoDeInvestimentos: boolean;
  aoVerInvestimentos: () => void;
  aoAvisar: (tipo: MensagemDoAviso["tipo"], texto: string) => void;
};

const EXPLICACAO =
  "O trecho rachurado no anel da meta mostra o que você guardou no mês para comprar depois. Ele não conta como gasto.";
const O_QUE_CONTA =
  "Conta o que você classificou como aporte ou resgate com esta caixinha. Posições divididas por fração e ligações da Revisão da bolsa ainda não entram.";

/** Uma marcação por caixinha; a ordem não muda o significado. */
function chaveDe(configuracao: Configuracao): string {
  const marcacoes = configuracao.marcacoes.map((m) => `${m.categoria}:${m.tag}`).sort();
  return JSON.stringify([configuracao.ativo, marcacoes]);
}

function mensagemDoErro(erro: unknown): string {
  return erro instanceof ErroDaApiCliente && erro.codigo !== "sem_resposta"
    ? erro.mensagem
    : MENSAGEM_SEM_RESPOSTA;
}

/**
 * Perfil, seção "Orçamento": liga o guardado nas metas (só exibição) e diz, por categoria de
 * gasto, quais caixinhas (destinações de investimento) guardam dinheiro para comprar nela.
 * Desligar preserva as marcações; o cálculo do que foi guardado é do servidor.
 */
export function GuardadoNasMetas({ gestaoDeInvestimentos, aoVerInvestimentos, aoAvisar }: Propriedades) {
  if (!gestaoDeInvestimentos) {
    return (
      <Cartao aria-label="Guardado para comprar nas metas">
        <EstadoVazio
          icone="investimentos"
          titulo="Ainda não há caixinhas para marcar"
          descricao="As caixinhas são as destinações dos seus investimentos. Quando houver, você poderá mostrá-las nas metas."
          acao={{ rotulo: "Ver investimentos", aoClicar: aoVerInvestimentos }}
        />
      </Cartao>
    );
  }
  return <Configurador aoVerInvestimentos={aoVerInvestimentos} aoAvisar={aoAvisar} />;
}

function Configurador({ aoVerInvestimentos, aoAvisar }: Omit<Propriedades, "gestaoDeInvestimentos">) {
  const guardado = useGuardadoNasMetas();
  const investimentos = useInvestimentos();
  const catalogo = useDestinacoesCadastradas();
  const categorias = useCategorias();
  const salvar = useDefinirGuardadoNasMetas();
  const [rascunho, definirRascunho] = useState<Configuracao | null>(null);

  const salva = guardado.dados;
  const atual = rascunho ?? salva;
  const erroDeLeitura = guardado.erro ?? investimentos.erro ?? categorias.erro ?? catalogo.erro;

  let conteudo;
  if (atual === undefined || investimentos.dados === undefined || categorias.dados === undefined || catalogo.dados === undefined) {
    conteudo = erroDeLeitura ? (
      <EstadoDeErro
        mensagem={mensagemDoErro(erroDeLeitura)}
        aoTentarDeNovo={() => {
          invalidar("guardado-nas-metas");
          invalidar("investimentos");
          invalidar("categorias");
          invalidar("destinacoes-cadastradas");
        }}
      />
    ) : (
      <Esqueleto linhas={2} rotulo="Carregando a configuração" />
    );
  } else {
    const caixinhas = [
      ...new Set(
        [
          ...catalogo.dados.map((item) => item.nome),
          ...investimentos.dados.flatMap((posicao) =>
            posicao.destinacoes.flatMap((d) => (d.tag === null ? [] : [d.tag])),
          ),
        ],
      ),
    ].sort((a, b) => a.localeCompare(b, "pt-BR"));
    if (caixinhas.length === 0) {
      conteudo = (
        <EstadoVazio
          icone="investimentos"
          titulo="Ainda não há caixinhas para marcar"
          descricao="As caixinhas são as destinações dos seus investimentos. Quando houver, você poderá mostrá-las nas metas."
          acao={{ rotulo: "Ver investimentos", aoClicar: aoVerInvestimentos }}
        />
      );
    } else {
      const categoriasAtivas = categorias.dados.filter((c) => !c.legada);
      const mudou = salva !== undefined && chaveDe(atual) !== chaveDe(salva);
      const nomeDaCategoria = new Map(categoriasAtivas.map((c) => [c.codigo, c.nome]));

      const trocarMarcacoes = (categoria: string, tags: string[]) => {
        const outras = atual.marcacoes.filter((m) => m.categoria !== categoria);
        const novas: CaixinhaMarcada[] = tags.map((tag) => ({ categoria, tag }));
        definirRascunho({ ...atual, marcacoes: [...outras, ...novas] });
      };

      async function aoSalvar() {
        const resposta = await salvar.executar(atual as Configuracao);
        if (resposta !== undefined) aoAvisar("confirmacao", "Configuração salva.");
      }

      conteudo = (
        <>
          <Caixa
            rotulo="Mostrar nas metas o que guardei para comprar"
            marcada={atual.ativo}
            aoMudar={(ativo) => definirRascunho({ ...atual, ativo })}
          />
          {atual.ativo && (
            <>
              <ul className={estilos.categorias}>
                {categoriasAtivas.map((categoria) => {
                  const dela = atual.marcacoes.filter((m) => m.categoria === categoria.codigo).map((m) => m.tag);
                  return (
                    <li key={categoria.codigo} className={estilos.categoria}>
                      <SeletorMultiplo
                        rotulo={categoria.nome}
                        semSelecao="nenhuma"
                        selecionados={dela}
                        aoMudar={(tags) => trocarMarcacoes(categoria.codigo, tags)}
                        opcoes={caixinhas.map((tag) => {
                          const emUso = atual.marcacoes.find((m) => m.tag === tag && m.categoria !== categoria.codigo);
                          return {
                            valor: tag,
                            rotulo: rotuloDeExibicao(tag),
                            desabilitada: emUso !== undefined,
                            ajuda:
                              emUso === undefined
                                ? undefined
                                : `Em uso em ${nomeDaCategoria.get(emUso.categoria) ?? emUso.categoria}`,
                          };
                        })}
                      />
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {salvar.erro != null && (
            <EstadoDeErro titulo="Não foi possível salvar" mensagem={mensagemDoErro(salvar.erro)} />
          )}
          <div className={estilos.rodape}>
            <Botao variante="primario" disabled={!mudou || salvar.pendente} onClick={aoSalvar}>
              Salvar
            </Botao>
            {!mudou && <span className={estilos.apoio}>Nenhuma mudança para salvar.</span>}
          </div>
        </>
      );
    }
  }

  return (
    <Cartao aria-label="Guardado para comprar nas metas" className={estilos.cartao}>
      <Titulo nivel="cartao">Guardado para comprar nas metas</Titulo>
      <p className={estilos.apoio}>{EXPLICACAO}</p>
      <p className={estilos.apoio}>{O_QUE_CONTA}</p>
      {conteudo}
    </Cartao>
  );
}
