from uuid import UUID

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.excecoes import TransacaoImportadaInvalida, TransacaoImportadaNaoEncontrada
from gastoba.domain.ganho import Ganho, OrigemDoGanho
from gastoba.domain.gasto import Gasto, OrigemDoGasto
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.tag import Tag
from gastoba.domain.transacao_importada import SentidoDaTransacao


class AceitarTransacaoImportada:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self,
        usuario_id: UUID,
        transacao_id: UUID,
        categoria: CategoriaDoGasto | None,
        tags: list[str],
    ) -> Gasto | Ganho:
        """Transforma a transação pendente em gasto (com categoria) ou ganho, sem mexer no saldo.

        O saldo de uma conta importada é o do banco, que já refletiu a transação.
        """
        with self._unidade_de_trabalho as uow:
            transacao = uow.transacoes_importadas.obter(usuario_id, transacao_id)
            if transacao is None:
                raise TransacaoImportadaNaoEncontrada("Transação importada não encontrada.")
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
                    tags=tags_do_lancamento,
                    origem=OrigemDoGanho.OPEN_FINANCE,
                )
                transacao.aceitar()
                uow.ganhos.adicionar(lancamento)
            uow.transacoes_importadas.atualizar_estado(transacao)
            uow.commit()
            return lancamento
