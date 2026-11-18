from datetime import date
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from gastoba.domain.conta import PapelDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import TransacaoImportadaInvalida
from gastoba.domain.transferencia_entre_contas import TransferenciaEntreContas
from gastoba.infrastructure.persistencia.modelos import (
    TransferenciaEntreContasModelo,
)


class RepositorioDeTransferenciasSqlAlchemy:
    def __init__(self, sessao: Session) -> None:
        self._sessao = sessao

    @staticmethod
    def _entidade(m: TransferenciaEntreContasModelo) -> TransferenciaEntreContas:
        return TransferenciaEntreContas(
            m.usuario_id,
            m.conta_origem_id,
            m.conta_destino_id,
            Dinheiro(m.valor_centavos),
            m.data,
            PapelDaConta(m.papel_origem),
            PapelDaConta(m.papel_destino),
            m.transacao_origem_id,
            m.transacao_destino_id,
            m.competencia_provisoria,
            m.ativa,
            m.id,
        )

    def obter(self, usuario_id: UUID, transferencia_id: UUID) -> TransferenciaEntreContas | None:
        m = self._sessao.scalar(
            select(TransferenciaEntreContasModelo).where(
                TransferenciaEntreContasModelo.id == transferencia_id,
                TransferenciaEntreContasModelo.usuario_id == usuario_id,
            )
        )
        return self._entidade(m) if m else None

    def da_transacao(self, usuario_id: UUID, transacao_id: UUID) -> TransferenciaEntreContas | None:
        m = self._sessao.scalar(
            select(TransferenciaEntreContasModelo).where(
                TransferenciaEntreContasModelo.usuario_id == usuario_id,
                TransferenciaEntreContasModelo.ativa.is_(True),
                or_(
                    TransferenciaEntreContasModelo.transacao_origem_id == transacao_id,
                    TransferenciaEntreContasModelo.transacao_destino_id == transacao_id,
                ),
            )
        )
        return self._entidade(m) if m else None

    def listar(self, usuario_id: UUID, inicio: date, fim: date) -> list[TransferenciaEntreContas]:
        return [
            self._entidade(m)
            for m in self._sessao.scalars(
                select(TransferenciaEntreContasModelo)
                .where(
                    TransferenciaEntreContasModelo.usuario_id == usuario_id,
                    TransferenciaEntreContasModelo.ativa.is_(True),
                    TransferenciaEntreContasModelo.data >= inicio,
                    TransferenciaEntreContasModelo.data <= fim,
                )
                .order_by(TransferenciaEntreContasModelo.data, TransferenciaEntreContasModelo.id)
            )
        ]

    def salvar(self, t: TransferenciaEntreContas) -> None:
        m = self._sessao.get(TransferenciaEntreContasModelo, t.id)
        if m is None:
            m = TransferenciaEntreContasModelo(id=t.id)
            self._sessao.add(m)
        for chave in (
            "usuario_id",
            "conta_origem_id",
            "conta_destino_id",
            "data",
            "transacao_origem_id",
            "transacao_destino_id",
            "competencia_provisoria",
            "ativa",
        ):
            setattr(m, chave, getattr(t, chave))
        m.valor_centavos = t.valor.centavos
        m.papel_origem = t.papel_origem.value
        m.papel_destino = t.papel_destino.value
        try:
            self._sessao.flush()
        except IntegrityError:
            raise TransacaoImportadaInvalida(
                "Esta ponta já pertence a outra transferência."
            ) from None
