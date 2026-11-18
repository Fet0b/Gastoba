from collections.abc import Sequence
from uuid import UUID

from gastoba.application.destinar_movimento import preparar_destinacoes
from gastoba.domain.caixinha import TIPO_DA_CAIXINHA
from gastoba.domain.categoria import CategoriaDoGasto, exigir_categoria_ativa
from gastoba.domain.destinacao import Destinacao
from gastoba.domain.excecoes import TransacaoImportadaInvalida, TransacaoImportadaNaoEncontrada
from gastoba.domain.ganho import Ganho, OrigemDoGanho
from gastoba.domain.gasto import Gasto, OrigemDoGasto
from gastoba.domain.movimento_de_investimento import (
    MovimentoDeInvestimento,
    TipoDeMovimento,
    exigir_movimento_sem_categoria,
)
from gastoba.domain.natureza_do_movimento import (
    e_conta_remunerada,
    exigir_lancamento_comum,
    validar_tipo_de_movimento,
)
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.tag import Tag
from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada

Lancamento = Gasto | Ganho | MovimentoDeInvestimento


def aceitar_sem_confirmar(
    uow: UnidadeDeTrabalho,
    usuario_id: UUID,
    transacao_id: UUID,
    categoria: CategoriaDoGasto | None,
    tags: Sequence[str],
    como_investimento: bool = False,
    investimento_id: UUID | None = None,
    destinacoes: Sequence[Destinacao] = (),
    tipo_de_movimento: TipoDeMovimento | None = None,
    movimento_relacionado_id: UUID | None = None,
) -> Lancamento:
    """Aceita a transação dentro da unidade de trabalho de quem chama, sem ``commit``.

    Separado de ``AceitarTransacaoImportada`` para o aceite em lote usar a mesma regra numa só
    transação.
    """
    transacao = uow.transacoes_importadas.obter(usuario_id, transacao_id)
    if transacao is None:
        raise TransacaoImportadaNaoEncontrada("Transação importada não encontrada.")
    if categoria is not None:
        exigir_categoria_ativa(categoria)
    if como_investimento:
        return _como_movimento(
            uow,
            usuario_id,
            transacao,
            categoria,
            tags,
            investimento_id,
            destinacoes,
            tipo_de_movimento,
            movimento_relacionado_id,
        )
    exigir_lancamento_comum(transacao.descricao)
    if tipo_de_movimento is not None or movimento_relacionado_id is not None:
        raise TransacaoImportadaInvalida(
            "Escolha classificar como investimento para esta natureza."
        )
    if investimento_id is not None or destinacoes:
        raise TransacaoImportadaInvalida("Investimento e destinações só valem para aporte.")
    exigir_lancamento_comum(transacao.descricao)
    tags_do_lancamento = tuple(Tag.de_texto(tag) for tag in tags)
    lancamento: Gasto | Ganho
    if transacao.sentido == SentidoDaTransacao.SAIDA:
        if categoria is None:
            raise TransacaoImportadaInvalida("Escolha a categoria do gasto.")
        lancamento = Gasto(
            conta_id=transacao.conta_id,
            valor=transacao.valor,
            descricao=transacao.descricao,
            data=transacao.data,
            transacao_importada_id=transacao.id,
            categoria=categoria,
            tags=tags_do_lancamento,
            origem=OrigemDoGasto.OPEN_FINANCE,
        )
        transacao.aceitar()
        uow.gastos.adicionar(lancamento)
    else:
        if categoria is not None:
            raise TransacaoImportadaInvalida("Ganho não tem categoria.")
        lancamento = Ganho(
            conta_id=transacao.conta_id,
            valor=transacao.valor,
            descricao=transacao.descricao,
            data=transacao.data,
            transacao_importada_id=transacao.id,
            tags=tags_do_lancamento,
            origem=OrigemDoGanho.OPEN_FINANCE,
        )
        transacao.aceitar()
        uow.ganhos.adicionar(lancamento)
    uow.transacoes_importadas.atualizar_estado(transacao)
    return lancamento


def _como_movimento(
    uow: UnidadeDeTrabalho,
    usuario_id: UUID,
    transacao: TransacaoImportada,
    categoria: CategoriaDoGasto | None,
    tags: Sequence[str],
    investimento_id: UUID | None,
    destinacoes: Sequence[Destinacao],
    tipo_de_movimento: TipoDeMovimento | None = None,
    movimento_relacionado_id: UUID | None = None,
) -> MovimentoDeInvestimento:
    exigir_movimento_sem_categoria(categoria)
    if tags:
        raise TransacaoImportadaInvalida("Aporte e resgate não têm tags: use as destinações.")
    if transacao.sentido == SentidoDaTransacao.ENTRADA and categoria is not None:
        raise TransacaoImportadaInvalida("Resgate não tem categoria.")
    if investimento_id is None and destinacoes:
        raise TransacaoImportadaInvalida("Escolha o investimento para destinar o valor.")
    tipo = tipo_de_movimento or (
        TipoDeMovimento.RESGATE
        if transacao.sentido == SentidoDaTransacao.ENTRADA
        else TipoDeMovimento.APORTE
    )
    validar_tipo_de_movimento(
        transacao.descricao, tipo, transacao.sentido == SentidoDaTransacao.ENTRADA
    )
    if e_conta_remunerada(transacao.descricao):
        posicao = uow.investimentos.obter(usuario_id, investimento_id) if investimento_id else None
        if (
            posicao is None
            or posicao.tipo != TIPO_DA_CAIXINHA
            or posicao.conta_remunerada_id != transacao.conta_id
        ):
            raise TransacaoImportadaInvalida("Escolha a caixinha desta conta investimentos.")
    movimento = MovimentoDeInvestimento(
        conta_id=transacao.conta_id,
        tipo=tipo,
        valor=transacao.valor,
        descricao=transacao.descricao,
        data=transacao.data,
        transacao_importada_id=transacao.id,
        categoria=categoria,
        investimento_id=investimento_id
        if tipo in (TipoDeMovimento.RENDIMENTO, TipoDeMovimento.CUSTO, TipoDeMovimento.IMPOSTO)
        else None,
        movimento_relacionado_id=movimento_relacionado_id,
    )
    partes = (
        preparar_destinacoes(uow, usuario_id, movimento, investimento_id, destinacoes)
        if investimento_id is not None
        else []
    )
    transacao.aceitar()
    uow.movimentos_de_investimento.adicionar(movimento)
    if investimento_id is not None:
        uow.destinacoes.adicionar(movimento.id, partes)
    uow.transacoes_importadas.atualizar_estado(transacao)
    return movimento


class AceitarTransacaoImportada:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self,
        usuario_id: UUID,
        transacao_id: UUID,
        categoria: CategoriaDoGasto | None,
        tags: Sequence[str],
        *,
        como_investimento: bool = False,
        investimento_id: UUID | None = None,
        destinacoes: Sequence[Destinacao] = (),
        tipo_de_movimento: TipoDeMovimento | None = None,
        movimento_relacionado_id: UUID | None = None,
    ) -> Lancamento:
        """Transforma a transação pendente em gasto (com categoria) ou ganho, sem mexer no saldo.

        Com ``como_investimento``, a saída vira aporte e a entrada vira resgate: nenhum dos dois é
        gasto nem ganho. Aporte e resgate não têm categoria de despesa.
        Com ``investimento_id``, o valor é repartido entre as ``destinacoes``
        (que somam 100%). O saldo de uma conta importada é o do banco, que já refletiu a transação.
        """
        with self._unidade_de_trabalho as uow:
            lancamento = aceitar_sem_confirmar(
                uow,
                usuario_id,
                transacao_id,
                categoria,
                tags,
                como_investimento,
                investimento_id,
                destinacoes,
                tipo_de_movimento,
                movimento_relacionado_id,
            )
            uow.commit()
            return lancamento
