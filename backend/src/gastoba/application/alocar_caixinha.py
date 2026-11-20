from collections.abc import Sequence
from uuid import UUID

from gastoba.application.listar_investimentos import valor_sem_caixinha
from gastoba.domain.alocacao_de_caixinha import AlocacaoDeCaixinha
from gastoba.domain.destinacao import Destinacao, dividir_por_percentuais
from gastoba.domain.excecoes import DestinacaoInvalida, InvestimentoNaoEncontrado, SemValorADestinar
from gastoba.domain.portas import UnidadeDeTrabalho


class AlocarCaixinha:
    """Aloca à mão a parte "sem caixinha" (compra nova) a uma ou mais caixinhas existentes.

    A parte se reparte pelos percentuais (soma 100), em centavos inteiros, e soma-se ao peso de
    cada caixinha; as frações das demais não mudam sozinhas. Nada é gravado em saldo, gasto ou
    principal: a alocação é só a fração da posição.
    """

    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self, usuario_id: UUID, investimento_id: UUID, destinacoes: Sequence[Destinacao]
    ) -> None:
        with self._unidade_de_trabalho as uow:
            investimento = uow.investimentos.obter(usuario_id, investimento_id)
            if investimento is None:
                raise InvestimentoNaoEncontrado("Investimento não encontrado.")
            ids = uow.alocacoes.ids_das_tags(usuario_id)
            if any(d.tag not in ids for d in destinacoes):
                raise DestinacaoInvalida("Escolha caixinhas que já existem.")
            pesos = {
                a.destinacao_id: a.peso_centavos
                for a in uow.alocacoes.listar_da_posicao(usuario_id, investimento_id)
            }
            sem_caixinha = valor_sem_caixinha(uow, usuario_id, investimento, sum(pesos.values()))
            if sem_caixinha.centavos <= 0:
                raise SemValorADestinar("Não há valor sem caixinha nesta posição.")
            for tag, parte in dividir_por_percentuais(sem_caixinha, destinacoes):
                if parte.centavos > 0:
                    pesos[ids[tag]] = pesos.get(ids[tag], 0) + parte.centavos
            uow.alocacoes.substituir(
                usuario_id,
                investimento_id,
                [AlocacaoDeCaixinha(investimento_id, i, p) for i, p in pesos.items()],
            )
            uow.commit()
