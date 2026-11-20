from datetime import date
from uuid import UUID

from gastoba.domain.alocacao_de_caixinha import AlocacaoDeCaixinha
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import (
    DestinacaoInvalida,
    InvestimentoNaoEncontrado,
    PrincipalInsuficiente,
)
from gastoba.domain.investimento import Realocacao
from gastoba.domain.mudanca_de_fracao import MudancaDeFracao, mover_fracao
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.tag import Tag


def realocacao_da_mudanca(mudanca: MudancaDeFracao) -> Realocacao:
    """A realocação de fração na mesma forma da realocação antiga, para listar e responder."""
    assert mudanca.origem is not None
    return Realocacao(
        mudanca.posicao_id, mudanca.origem, mudanca.destino, mudanca.valor, mudanca.data, mudanca.id
    )


class RealocarDestinacao:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self,
        usuario_id: UUID,
        investimento_id: UUID,
        origem: str,
        destino: str,
        data: date,
        valor: Dinheiro | None = None,
        percentual: int | None = None,
    ) -> Realocacao:
        """Move parte de uma destinação para outra, dentro do mesmo investimento.

        Informe o ``valor`` ou o ``percentual`` (inteiro de 1 a 100) da origem. O total do
        investimento não muda. Numa posição por fração (com pesos), move o peso da caixinha de
        origem para a de destino, que precisa estar cadastrada, e registra a mudança datada; nas
        demais, move o principal registrado e a realocação fica no histórico.
        """
        if (valor is None) == (percentual is None):
            raise DestinacaoInvalida("Informe o valor ou o percentual a realocar, só um deles.")
        if percentual is not None and (isinstance(percentual, bool) or not 1 <= percentual <= 100):
            raise DestinacaoInvalida("O percentual deve ser um inteiro de 1 a 100.")
        tag_de_origem = Tag.de_texto(origem)
        tag_de_destino = Tag.de_texto(destino)
        with self._unidade_de_trabalho as uow:
            if uow.investimentos.obter(usuario_id, investimento_id) is None:
                raise InvestimentoNaoEncontrado("Investimento não encontrado.")
            alocadas = uow.alocacoes.listar_da_posicao(usuario_id, investimento_id)
            if alocadas:
                pedido = (tag_de_origem, tag_de_destino, data, valor, percentual)
                realocacao = _mover_fracao(uow, usuario_id, investimento_id, alocadas, *pedido)
            else:
                principais = uow.destinacoes.principais(usuario_id).get(investimento_id, {})
                principal = principais.get(tag_de_origem, Dinheiro(0))
                if percentual is not None:
                    valor = principal.percentual(percentual)
                assert valor is not None
                realocacao = Realocacao(investimento_id, tag_de_origem, tag_de_destino, valor, data)
                if valor.centavos > principal.centavos:
                    raise PrincipalInsuficiente("A realocação passa do principal da destinação.")
                uow.destinacoes.adicionar_realocacao(realocacao)
            uow.commit()
            return realocacao


def _mover_fracao(
    uow: UnidadeDeTrabalho,
    usuario_id: UUID,
    investimento_id: UUID,
    alocadas: list[AlocacaoDeCaixinha],
    origem: Tag,
    destino: Tag,
    data: date,
    valor: Dinheiro | None,
    percentual: int | None,
) -> Realocacao:
    if origem == destino:
        raise DestinacaoInvalida("A origem e o destino da realocação devem ser diferentes.")
    ids = uow.alocacoes.ids_das_tags(usuario_id)
    if destino not in ids:
        raise DestinacaoInvalida("Escolha como destino uma caixinha que já existe.")
    pesos = {a.destinacao_id: a.peso_centavos for a in alocadas}
    if origem not in ids or ids[origem] not in pesos:
        raise PrincipalInsuficiente("A caixinha de origem não tem fração nesta posição.")
    if percentual is not None:
        valor = Dinheiro(pesos[ids[origem]]).percentual(percentual)
    assert valor is not None
    mudanca = MudancaDeFracao(investimento_id, data, destino, valor, origem)
    novos = mover_fracao(pesos, ids[origem], ids[destino], valor.centavos)
    uow.alocacoes.substituir(
        usuario_id,
        investimento_id,
        [AlocacaoDeCaixinha(investimento_id, i, p) for i, p in novos.items()],
    )
    uow.mudancas_de_fracao.adicionar(usuario_id, mudanca)
    return realocacao_da_mudanca(mudanca)
