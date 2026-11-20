from collections.abc import Sequence
from uuid import UUID

from gastoba.application.aceitar_transacao_importada import e_conta_de_investimentos
from gastoba.application.destinar_movimento import preparar_destinacoes
from gastoba.domain.categoria import exigir_categoria_ativa
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.divisao_da_transacao import ParteDaTransacao, dividir_valor
from gastoba.domain.excecoes import TransacaoImportadaInvalida, TransacaoImportadaNaoEncontrada
from gastoba.domain.ganho import Ganho, OrigemDoGanho
from gastoba.domain.gasto import TAMANHO_MAXIMO_DA_DESCRICAO, Gasto, OrigemDoGasto
from gastoba.domain.movimento_de_investimento import (
    MovimentoDeInvestimento,
    TipoDeMovimento,
    exigir_movimento_sem_categoria,
)
from gastoba.domain.natureza_do_movimento import exigir_lancamento_comum
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.tag import Tag
from gastoba.domain.transacao_importada import SentidoDaTransacao

LancamentoDaDivisao = Gasto | Ganho | MovimentoDeInvestimento


def _validar_parte(parte: ParteDaTransacao, saida: bool) -> None:
    if parte.categoria is not None:
        exigir_categoria_ativa(parte.categoria)
    aporte = parte.como_investimento
    if aporte:
        exigir_movimento_sem_categoria(parte.categoria)
    if aporte and not saida:
        raise TransacaoImportadaInvalida("Aporte só vale na saída.")
    if saida and not aporte and parte.categoria is None:
        raise TransacaoImportadaInvalida("Escolha a categoria de cada parte.")
    if not saida and parte.categoria is not None:
        raise TransacaoImportadaInvalida("Ganho não tem categoria.")
    if aporte and parte.tags:
        raise TransacaoImportadaInvalida("Aporte não tem tags: use as destinações.")
    if not aporte and (parte.investimento_id is not None or parte.destinacoes):
        raise TransacaoImportadaInvalida("Investimento e destinações só valem para aporte.")
    if parte.investimento_id is None and parte.destinacoes:
        raise TransacaoImportadaInvalida("Escolha o investimento para destinar o valor.")


class AceitarTransacaoImportadaDividida:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self, usuario_id: UUID, transacao_id: UUID, partes: Sequence[ParteDaTransacao]
    ) -> list[LancamentoDaDivisao]:
        """Aceita a transação pendente dividida em 2 a 10 partes, cada uma um lançamento.

        Cada parte tem a sua categoria (só na saída) e as suas tags, e leva a fatia do valor em
        centavos inteiros (a soma é exatamente o valor da transação). Na saída, a parte com a
        marca ``como_investimento`` vira um aporte (com o investimento e as destinações opcionais)
        e as demais viram gastos; na entrada, cada parte vira um ganho. Uma parte que ficaria com
        zero centavo é descartada. Tudo ou nada; o saldo de conta importada não muda.
        """
        with self._unidade_de_trabalho as uow:
            transacao = uow.transacoes_importadas.obter(usuario_id, transacao_id)
            if transacao is None:
                raise TransacaoImportadaNaoEncontrada("Transação importada não encontrada.")
            transacao.exigir_pendente()
            de_investimentos = e_conta_de_investimentos(uow, usuario_id, transacao)
            exigir_lancamento_comum(transacao.descricao, de_investimentos)
            valores = dividir_valor(transacao.valor, partes)
            saida = transacao.sentido == SentidoDaTransacao.SAIDA
            for parte in partes:
                _validar_parte(parte, saida)
            total = len(partes)
            criados: list[LancamentoDaDivisao] = []
            destinacoes_a_gravar: list[
                tuple[MovimentoDeInvestimento, list[tuple[Tag, Dinheiro]]]
            ] = []
            for numero, (parte, valor) in enumerate(zip(partes, valores, strict=True), start=1):
                if valor.centavos == 0:
                    continue
                sufixo = f" ({numero}/{total})"
                descricao = transacao.descricao[: TAMANHO_MAXIMO_DA_DESCRICAO - len(sufixo)]
                descricao = descricao.rstrip() + sufixo
                lancamento: LancamentoDaDivisao
                if parte.como_investimento:
                    lancamento = MovimentoDeInvestimento(
                        conta_id=transacao.conta_id,
                        tipo=TipoDeMovimento.APORTE,
                        categoria=parte.categoria,
                        valor=valor,
                        descricao=descricao,
                        data=transacao.data,
                        transacao_importada_id=transacao.id,
                    )
                    if parte.investimento_id is not None:
                        partes_do_aporte = preparar_destinacoes(
                            uow, usuario_id, lancamento, parte.investimento_id, parte.destinacoes
                        )
                        destinacoes_a_gravar.append((lancamento, partes_do_aporte))
                elif saida:
                    exigir_lancamento_comum(transacao.descricao, de_investimentos)
                    assert parte.categoria is not None
                    lancamento = Gasto(
                        conta_id=transacao.conta_id,
                        valor=valor,
                        descricao=descricao,
                        data=transacao.data,
                        transacao_importada_id=transacao.id,
                        categoria=parte.categoria,
                        tags=parte.tags,
                        origem=OrigemDoGasto.OPEN_FINANCE,
                    )
                else:
                    exigir_lancamento_comum(transacao.descricao, de_investimentos)
                    lancamento = Ganho(
                        conta_id=transacao.conta_id,
                        valor=valor,
                        descricao=descricao,
                        data=transacao.data,
                        transacao_importada_id=transacao.id,
                        tags=parte.tags,
                        origem=OrigemDoGanho.OPEN_FINANCE,
                    )
                criados.append(lancamento)
            transacao.aceitar()
            for lancamento in criados:
                if isinstance(lancamento, MovimentoDeInvestimento):
                    uow.movimentos_de_investimento.adicionar(lancamento)
                elif isinstance(lancamento, Gasto):
                    uow.gastos.adicionar(lancamento)
                else:
                    uow.ganhos.adicionar(lancamento)
            for movimento, partes_do_aporte in destinacoes_a_gravar:
                uow.destinacoes.adicionar(movimento.id, partes_do_aporte)
            uow.transacoes_importadas.atualizar_estado(transacao)
            uow.commit()
            return criados
