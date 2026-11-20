import json
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from gastoba.domain.tratamento_de_aporte import AcaoDoTratamento, TratamentoDeAporte
from gastoba.infrastructure.persistencia.modelos import (
    ContaModelo,
    MovimentoDeInvestimentoModelo,
    TratamentoDeAporteModelo,
)


def _entidade(m: TratamentoDeAporteModelo) -> TratamentoDeAporte:
    return TratamentoDeAporte(
        movimento_id=m.movimento_id,
        acao=AcaoDoTratamento(m.acao),
        valores_originais=json.loads(m.valores_originais),
        criado_em=m.criado_em,
        mesclado_em_id=m.mesclado_em_id,
        aprovado_em=m.aprovado_em,
        desfeito_em=m.desfeito_em,
        id=m.id,
    )


class RepositorioDeTratamentosSqlAlchemy:
    def __init__(self, sessao: Session) -> None:
        self._sessao = sessao

    @staticmethod
    def _do_usuario(usuario_id: UUID):
        return (
            select(TratamentoDeAporteModelo)
            .join(
                MovimentoDeInvestimentoModelo,
                TratamentoDeAporteModelo.movimento_id == MovimentoDeInvestimentoModelo.id,
            )
            .join(ContaModelo, MovimentoDeInvestimentoModelo.conta_id == ContaModelo.id)
            .where(ContaModelo.usuario_id == usuario_id)
        )

    def adicionar(self, usuario_id: UUID, tratamento: TratamentoDeAporte) -> None:
        self._sessao.add(
            TratamentoDeAporteModelo(
                id=tratamento.id,
                movimento_id=tratamento.movimento_id,
                acao=tratamento.acao.value,
                mesclado_em_id=tratamento.mesclado_em_id,
                valores_originais=json.dumps(tratamento.valores_originais, sort_keys=True),
                criado_em=tratamento.criado_em,
                aprovado_em=tratamento.aprovado_em,
                desfeito_em=tratamento.desfeito_em,
            )
        )
        self._sessao.flush()

    def obter(self, usuario_id: UUID, tratamento_id: UUID) -> TratamentoDeAporte | None:
        m = self._sessao.scalar(
            self._do_usuario(usuario_id).where(TratamentoDeAporteModelo.id == tratamento_id)
        )
        return _entidade(m) if m else None

    def ativo_do_movimento(self, usuario_id: UUID, movimento_id: UUID) -> TratamentoDeAporte | None:
        m = self._sessao.scalar(
            self._do_usuario(usuario_id).where(
                TratamentoDeAporteModelo.movimento_id == movimento_id,
                TratamentoDeAporteModelo.desfeito_em.is_(None),
            )
        )
        return _entidade(m) if m else None

    def listar(self, usuario_id: UUID) -> list[TratamentoDeAporte]:
        modelos = self._sessao.scalars(
            self._do_usuario(usuario_id).order_by(
                TratamentoDeAporteModelo.criado_em, TratamentoDeAporteModelo.id
            )
        )
        return [_entidade(m) for m in modelos]

    def atualizar(self, usuario_id: UUID, tratamento: TratamentoDeAporte) -> None:
        m = self._sessao.scalar(
            self._do_usuario(usuario_id).where(TratamentoDeAporteModelo.id == tratamento.id)
        )
        if m is None:
            return
        m.aprovado_em = tratamento.aprovado_em
        m.desfeito_em = tratamento.desfeito_em
        self._sessao.flush()
