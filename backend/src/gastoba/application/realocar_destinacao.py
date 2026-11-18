from datetime import date
from uuid import UUID

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import (
    DestinacaoInvalida,
    InvestimentoNaoEncontrado,
    PrincipalInsuficiente,
)
from gastoba.domain.investimento import Realocacao
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.tag import Tag


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
        """Move parte do principal de uma destinação para outra, dentro do mesmo investimento.

        Informe o ``valor`` ou o ``percentual`` (inteiro de 1 a 100) do principal da origem. O
        total do investimento não muda; nada é apagado, a realocação fica no histórico.
        """
        if (valor is None) == (percentual is None):
            raise DestinacaoInvalida("Informe o valor ou o percentual a realocar, só um deles.")
        tag_de_origem = Tag.de_texto(origem)
        tag_de_destino = Tag.de_texto(destino)
        with self._unidade_de_trabalho as uow:
            if uow.investimentos.obter(usuario_id, investimento_id) is None:
                raise InvestimentoNaoEncontrado("Investimento não encontrado.")
            principais = uow.destinacoes.principais(usuario_id).get(investimento_id, {})
            principal = principais.get(tag_de_origem, Dinheiro(0))
            if percentual is not None:
                if isinstance(percentual, bool) or not 1 <= percentual <= 100:
                    raise DestinacaoInvalida("O percentual deve ser um inteiro de 1 a 100.")
                valor = principal.percentual(percentual)
            assert valor is not None
            realocacao = Realocacao(investimento_id, tag_de_origem, tag_de_destino, valor, data)
            if valor.centavos > principal.centavos:
                raise PrincipalInsuficiente("A realocação passa do principal da destinação.")
            uow.destinacoes.adicionar_realocacao(realocacao)
            uow.commit()
            return realocacao
