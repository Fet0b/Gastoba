import { ProvedorDeCoresDasDestinacoes, useCoresDasDestinacoes } from "../componentes/Investimentos/CoresDasDestinacoes";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { useDestinacoesCadastradas, useInvestimentos } from "../api/consultas";
import { invalidar } from "../api/useConsulta";
import type { MensagemDoAviso } from "../componentes/Aviso/Aviso";
import { Botao } from "../componentes/Botao/Botao";
import { AparenciaDaCaixinha } from "../componentes/Caixinhas/AparenciaDaCaixinha";
import { CartaoDaCaixinha } from "../componentes/Caixinhas/CartaoDaCaixinha";
import { ExcluirCaixinha } from "../componentes/Caixinhas/ExcluirCaixinha";
import { FormularioDeCaixinha } from "../componentes/Caixinhas/FormularioDeCaixinha";
import { PainelDaCaixinha } from "../componentes/Caixinhas/PainelDaCaixinha";
import { Cartao } from "../componentes/Cartao/Cartao";
import { Destaque } from "../componentes/Destaque/Destaque";
import { EstadoDeErro } from "../componentes/EstadoDeErro/EstadoDeErro";
import { EstadoVazio } from "../componentes/EstadoVazio/EstadoVazio";
import { Esqueleto } from "../componentes/Esqueleto/Esqueleto";
import type { Navegacao } from "../componentes/Navegacao/telas";
import { useEstadoDoOlho } from "../componentes/Olho/useEstadoDoOlho";
import { Pagina } from "../componentes/Pagina/Pagina";
import { deCentavos, formatar, paraCentavos } from "../dinheiro/dinheiro";
import { resumirCaixinhas } from "../investimentos/caixinhas";
import estilos from "./Caixinhas.module.css";

/**
 * Caixinhas: o que a pessoa guardou em cada caixinha. Cada cartão soma, em centavos, as partes
 * que o backend já calculou por posição; o detalhe mostra as posições. Criar ou excluir uma caixinha
 * não movimenta dinheiro.
 */
export function Caixinhas({ navegacao }: { navegacao: Navegacao }) {
  const [estadoDoOlho] = useEstadoDoOlho();
  const [mensagem, definirMensagem] = useState<MensagemDoAviso | null>(null);
  const [abertaId, definirAbertaId] = useState<string | null>(null);
  const [criando, definirCriando] = useState(false);
  const [mudandoAparencia, definirMudandoAparencia] = useState<string | null>(null);
  const [excluindo, definirExcluindo] = useState<{ id: string; nome: string } | null>(null);
  const idDoPainel = useId();
  const botaoDoTopo = useRef<HTMLButtonElement>(null);
  const botaoDoVazio = useRef<HTMLButtonElement>(null);
  const focarDepoisDeExcluir = useRef(false);
  const botoesDosCartoes = useRef(new Map<string, HTMLButtonElement>());

  const catalogo = useDestinacoesCadastradas();
  const investimentos = useInvestimentos();
  const corDaDestinacao = useCoresDasDestinacoes(investimentos.dados);
  const erro = catalogo.erro ?? investimentos.erro;
  const pronto = catalogo.dados !== undefined && investimentos.dados !== undefined;

  const resumos = useMemo(
    () => (pronto ? resumirCaixinhas(catalogo.dados ?? [], investimentos.dados ?? []) : []),
    [pronto, catalogo.dados, investimentos.dados],
  );
  const total = useMemo(
    () => deCentavos(resumos.reduce((soma, caixinha) => soma + paraCentavos(caixinha.valor), 0n)),
    [resumos],
  );
  const aberta = resumos.find((caixinha) => caixinha.id === abertaId);

  // A caixinha aberta foi excluída noutra aba: fecha o painel e avisa.
  useEffect(() => {
    if (abertaId === null || !pronto) return;
    if (!resumos.some((caixinha) => caixinha.id === abertaId)) {
      definirAbertaId(null);
      definirMensagem({ tipo: "erro", texto: "Esta caixinha não existe mais." });
    }
  }, [abertaId, pronto, resumos]);

  // Depois de excluir, o foco vai ao botão de criar que continuar na tela.
  useEffect(() => {
    if (!focarDepoisDeExcluir.current || !pronto) return;
    focarDepoisDeExcluir.current = false;
    (botaoDoTopo.current ?? botaoDoVazio.current)?.focus();
  }, [pronto, resumos]);

  const vazio = pronto && resumos.length === 0;

  const pagina = (
    <Pagina
      navegacao={navegacao}
      estadoDoOlho={estadoDoOlho}
      mensagem={mensagem}
      aoDispensarMensagem={() => definirMensagem(null)}
      cabecalho={{
        titulo: "Caixinhas",
        subtitulo: "Quanto você guardou em cada caixinha.",
        dica: {
          assunto: "as caixinhas",
          texto:
            "Caixinhas organizam investimentos que você já tem; criar ou excluir uma não movimenta dinheiro. O valor de cada caixinha é a soma das partes dela nas suas posições.",
        },
        // XI.4.1 e XI.7.1: a ação da página fica no cabeçalho, só com caixinhas; no vazio, só no estado vazio.
        acao: pronto && !vazio ? (
          <Botao ref={botaoDoTopo} variante="secundario" onClick={() => definirCriando(true)}>Criar caixinha</Botao>
        ) : undefined,
      }}
    >
      <div className={estilos.conteudo}>
        {erro ? (
          <EstadoDeErro
            mensagem="Não foi possível carregar as caixinhas."
            aoTentarDeNovo={() => { invalidar("destinacoes-cadastradas"); invalidar("investimentos"); }}
          />
        ) : !pronto ? (
          <Esqueleto rotulo="Carregando caixinhas" />
        ) : vazio ? (
          <Cartao>
            <EstadoVazio
              icone="cofre"
              titulo="Nenhuma caixinha ainda"
              descricao="Crie uma caixinha para organizar investimentos existentes, sem movimentar dinheiro."
              acao={{ ref: botaoDoVazio, rotulo: "Criar caixinha", aoClicar: () => definirCriando(true) }}
            />
          </Cartao>
        ) : (
          <>
            <Cartao variante="destaque">
              <Destaque rotulo="Guardado em caixinhas" valor={formatar(total)} tamanho="heroi" />
            </Cartao>
            <div className={estilos.grade} role="group" aria-label="Caixinhas">
              {resumos.map((caixinha) => (
                <CartaoDaCaixinha
                  key={caixinha.id}
                  resumo={caixinha}
                  aberto={caixinha.id === abertaId}
                  idDoPainel={idDoPainel}
                  refDoBotao={(botao) => { if (botao) botoesDosCartoes.current.set(caixinha.id, botao); else botoesDosCartoes.current.delete(caixinha.id); }}
                  aoAlternar={() => {
                    const fechando = caixinha.id === abertaId;
                    definirAbertaId(fechando ? null : caixinha.id);
                    // O foco volta ao cartão ao fechar (abrir leva o foco ao título do painel).
                    if (fechando) botoesDosCartoes.current.get(caixinha.id)?.focus();
                  }}
                  aoMudarAparencia={() => definirMudandoAparencia(caixinha.id)}
                  aoExcluir={() => definirExcluindo({ id: caixinha.id, nome: caixinha.nome })}
                />
              ))}
            </div>
            {aberta && (
              <PainelDaCaixinha
                key={aberta.id}
                resumo={aberta}
                id={idDoPainel}
                aoAlocar={() => navegacao.aoIrPara("investimentos")}
              />
            )}
          </>
        )}
      </div>
      <FormularioDeCaixinha aberto={criando} aoFechar={() => definirCriando(false)} />
      <AparenciaDaCaixinha
        caixinha={resumos.find((caixinha) => caixinha.id === mudandoAparencia) ?? null}
        aoFechar={() => definirMudandoAparencia(null)}
      />
      <ExcluirCaixinha
        caixinha={excluindo}
        emUso={(resumos.find((c) => c.id === excluindo?.id)?.partes.length ?? 0) > 0}
        aoCancelar={() => definirExcluindo(null)}
        aoExcluir={(motivo) => {
          if (excluindo && excluindo.id === abertaId) definirAbertaId(null);
          if (motivo === "ja_removida") definirMensagem({ tipo: "erro", texto: "Esta caixinha já tinha sido excluída." });
          focarDepoisDeExcluir.current = true;
          definirExcluindo(null);
        }}
      />
    </Pagina>
  );
  return <ProvedorDeCoresDasDestinacoes corDe={corDaDestinacao}>{pagina}</ProvedorDeCoresDasDestinacoes>;
}
