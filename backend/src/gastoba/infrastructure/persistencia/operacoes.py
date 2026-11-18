from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.dialects import sqlite
from sqlalchemy.orm import Session

from gastoba.domain.alocacao_de_caixinha import AlocacaoDeCaixinha
from gastoba.domain.casamento_de_operacao import (
    CasamentoDeOperacao,
    EstadoDoCasamento,
    PapelDoVinculo,
    VinculoDeCasamento,
)
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.operacao import Operacao, OrigemDaOperacao, TipoDeOperacao
from gastoba.domain.tag import Tag
from gastoba.infrastructure.persistencia.modelos import (
    AlocacaoDeCaixinhaModelo,
    CadastroDeDestinacaoModelo,
    CasamentoDeOperacaoModelo,
    InvestimentoModelo,
    OperacaoDeInvestimentoModelo,
    OperacaoDoCasamentoModelo,
    PosicaoDeInvestimentoModelo,
    VinculoDeCasamentoModelo,
)


def _meus_investimentos(usuario_id: UUID):
    return select(InvestimentoModelo.id).where(InvestimentoModelo.usuario_id == usuario_id)


class RepositorioDeOperacoesSqlAlchemy:
    def __init__(self, sessao: Session) -> None:
        self._sessao = sessao

    @staticmethod
    def _entidade(m: OperacaoDeInvestimentoModelo) -> Operacao:
        return Operacao(
            posicao_id=m.posicao_id,
            tipo=TipoDeOperacao(m.tipo),
            data=m.data,
            quantidade=Decimal(m.quantidade),
            valor_bruto=Dinheiro(m.valor_bruto_centavos),
            origem=OrigemDaOperacao(m.origem),
            custos=Dinheiro(m.custos_centavos),
            id_externo=m.id_externo,
            operacao_relacionada_id=m.operacao_relacionada_id,
            quantidade_estimada=m.quantidade_estimada,
            id=m.id,
        )

    def garantir_posicao(self, usuario_id: UUID, investimento_id: UUID) -> bool:
        dono = self._sessao.scalar(
            select(InvestimentoModelo.id).where(
                InvestimentoModelo.id == investimento_id,
                InvestimentoModelo.usuario_id == usuario_id,
            )
        )
        if dono is None:
            return False
        self._sessao.execute(
            sqlite.insert(PosicaoDeInvestimentoModelo)
            .values(investimento_id=investimento_id)
            .on_conflict_do_nothing()
        )
        return True

    def adicionar(self, usuario_id: UUID, operacao: Operacao) -> bool:
        if not self.garantir_posicao(usuario_id, operacao.posicao_id):
            return False
        if operacao.id_externo is not None:
            existente = self._sessao.scalar(
                select(OperacaoDeInvestimentoModelo.id).where(
                    OperacaoDeInvestimentoModelo.posicao_id == operacao.posicao_id,
                    OperacaoDeInvestimentoModelo.id_externo == operacao.id_externo,
                )
            )
            if existente is not None:
                return False
        self._sessao.add(
            OperacaoDeInvestimentoModelo(
                id=operacao.id,
                posicao_id=operacao.posicao_id,
                tipo=operacao.tipo.value,
                data=operacao.data,
                quantidade=str(operacao.quantidade),
                valor_bruto_centavos=operacao.valor_bruto.centavos,
                custos_centavos=operacao.custos.centavos,
                origem=operacao.origem.value,
                id_externo=operacao.id_externo,
                operacao_relacionada_id=operacao.operacao_relacionada_id,
                quantidade_estimada=operacao.quantidade_estimada,
            )
        )
        self._sessao.flush()
        return True

    def _do_usuario(self, usuario_id: UUID, operacao_id: UUID):
        return self._sessao.scalar(
            select(OperacaoDeInvestimentoModelo).where(
                OperacaoDeInvestimentoModelo.id == operacao_id,
                OperacaoDeInvestimentoModelo.posicao_id.in_(_meus_investimentos(usuario_id)),
            )
        )

    def obter(self, usuario_id: UUID, operacao_id: UUID) -> Operacao | None:
        m = self._do_usuario(usuario_id, operacao_id)
        return self._entidade(m) if m else None

    def listar_da_posicao(self, usuario_id: UUID, posicao_id: UUID) -> list[Operacao]:
        modelos = self._sessao.scalars(
            select(OperacaoDeInvestimentoModelo)
            .where(
                OperacaoDeInvestimentoModelo.posicao_id == posicao_id,
                OperacaoDeInvestimentoModelo.posicao_id.in_(_meus_investimentos(usuario_id)),
            )
            .order_by(OperacaoDeInvestimentoModelo.data, OperacaoDeInvestimentoModelo.id)
        )
        return [self._entidade(m) for m in modelos]

    def definir_observacao(
        self,
        usuario_id: UUID,
        investimento_id: UUID,
        quantidade: Decimal | None,
        valor_de_mercado: Dinheiro | None,
        atualizada_em: datetime | None,
    ) -> None:
        if not self.garantir_posicao(usuario_id, investimento_id):
            return
        posicao = self._sessao.get(PosicaoDeInvestimentoModelo, investimento_id)
        posicao.quantidade_observada = None if quantidade is None else str(quantidade)
        posicao.valor_de_mercado_centavos = (
            None if valor_de_mercado is None else valor_de_mercado.centavos
        )
        posicao.atualizada_em = atualizada_em
        self._sessao.flush()

    def atualizar(self, usuario_id: UUID, operacao: Operacao) -> None:
        m = self._do_usuario(usuario_id, operacao.id)
        if m is None:
            return
        m.tipo = operacao.tipo.value
        m.data = operacao.data
        m.quantidade = str(operacao.quantidade)
        m.valor_bruto_centavos = operacao.valor_bruto.centavos
        m.custos_centavos = operacao.custos.centavos
        m.operacao_relacionada_id = operacao.operacao_relacionada_id
        m.quantidade_estimada = operacao.quantidade_estimada
        self._sessao.flush()

    def remover(self, usuario_id: UUID, operacao_id: UUID) -> None:
        m = self._do_usuario(usuario_id, operacao_id)
        if m is not None:
            self._sessao.delete(m)
            self._sessao.flush()


class RepositorioDeAlocacoesSqlAlchemy:
    def __init__(self, sessao: Session) -> None:
        self._sessao = sessao

    def ids_das_tags(self, usuario_id: UUID) -> dict[Tag, UUID]:
        linhas = self._sessao.execute(
            select(CadastroDeDestinacaoModelo.nome, CadastroDeDestinacaoModelo.id).where(
                CadastroDeDestinacaoModelo.usuario_id == usuario_id
            )
        )
        return {Tag(nome): id for nome, id in linhas}

    def listar_da_posicao(self, usuario_id: UUID, posicao_id: UUID) -> list[AlocacaoDeCaixinha]:
        modelos = self._sessao.scalars(
            select(AlocacaoDeCaixinhaModelo)
            .where(
                AlocacaoDeCaixinhaModelo.posicao_id == posicao_id,
                AlocacaoDeCaixinhaModelo.posicao_id.in_(_meus_investimentos(usuario_id)),
            )
            .order_by(AlocacaoDeCaixinhaModelo.destinacao_id)
        )
        return [AlocacaoDeCaixinha(m.posicao_id, m.destinacao_id, m.peso_centavos) for m in modelos]

    def substituir(
        self, usuario_id: UUID, posicao_id: UUID, alocacoes: list[AlocacaoDeCaixinha]
    ) -> None:
        if (
            self._sessao.scalar(
                _meus_investimentos(usuario_id).where(InvestimentoModelo.id == posicao_id)
            )
            is None
        ):
            return
        self._sessao.execute(
            delete(AlocacaoDeCaixinhaModelo).where(
                AlocacaoDeCaixinhaModelo.posicao_id == posicao_id
            )
        )
        for a in alocacoes:
            self._sessao.add(
                AlocacaoDeCaixinhaModelo(
                    posicao_id=a.posicao_id,
                    destinacao_id=a.destinacao_id,
                    peso_centavos=a.peso_centavos,
                )
            )
        self._sessao.flush()


class RepositorioDeCasamentosSqlAlchemy:
    def __init__(self, sessao: Session) -> None:
        self._sessao = sessao

    def _do_usuario(self, usuario_id: UUID):
        # O dono é o da posição de qualquer operação do casamento.
        meus = (
            select(OperacaoDoCasamentoModelo.casamento_id)
            .join(
                OperacaoDeInvestimentoModelo,
                OperacaoDoCasamentoModelo.operacao_id == OperacaoDeInvestimentoModelo.id,
            )
            .where(OperacaoDeInvestimentoModelo.posicao_id.in_(_meus_investimentos(usuario_id)))
        )
        return select(CasamentoDeOperacaoModelo).where(CasamentoDeOperacaoModelo.id.in_(meus))

    def _entidades(self, modelos: list[CasamentoDeOperacaoModelo]) -> list[CasamentoDeOperacao]:
        ids = [m.id for m in modelos]
        if not ids:
            return []
        operacoes: dict[UUID, list[UUID]] = {}
        for casamento_id, operacao_id in self._sessao.execute(
            select(OperacaoDoCasamentoModelo.casamento_id, OperacaoDoCasamentoModelo.operacao_id)
            .where(OperacaoDoCasamentoModelo.casamento_id.in_(ids))
            .order_by(OperacaoDoCasamentoModelo.operacao_id)
        ):
            operacoes.setdefault(casamento_id, []).append(operacao_id)
        vinculos: dict[UUID, list[VinculoDeCasamento]] = {}
        for v in self._sessao.scalars(
            select(VinculoDeCasamentoModelo)
            .where(VinculoDeCasamentoModelo.casamento_id.in_(ids))
            .order_by(VinculoDeCasamentoModelo.transacao_importada_id)
        ):
            vinculos.setdefault(v.casamento_id, []).append(
                VinculoDeCasamento(v.transacao_importada_id, PapelDoVinculo(v.papel))
            )
        return [
            CasamentoDeOperacao(
                operacao_ids=tuple(operacoes.get(m.id, ())),
                vinculos=tuple(vinculos.get(m.id, ())),
                estado=EstadoDoCasamento(m.estado),
                id=m.id,
            )
            for m in modelos
        ]

    def adicionar(self, usuario_id: UUID, casamento: CasamentoDeOperacao) -> None:
        self._sessao.add(CasamentoDeOperacaoModelo(id=casamento.id, estado=casamento.estado.value))
        self._sessao.flush()
        for operacao_id in casamento.operacao_ids:
            self._sessao.add(
                OperacaoDoCasamentoModelo(casamento_id=casamento.id, operacao_id=operacao_id)
            )
        for v in casamento.vinculos:
            self._sessao.add(
                VinculoDeCasamentoModelo(
                    casamento_id=casamento.id,
                    transacao_importada_id=v.transacao_importada_id,
                    papel=v.papel.value,
                )
            )
        self._sessao.flush()

    def obter(self, usuario_id: UUID, casamento_id: UUID) -> CasamentoDeOperacao | None:
        m = self._sessao.scalar(
            self._do_usuario(usuario_id).where(CasamentoDeOperacaoModelo.id == casamento_id)
        )
        return self._entidades([m])[0] if m else None

    def para_operacao(self, usuario_id: UUID, operacao_id: UUID) -> CasamentoDeOperacao | None:
        m = self._sessao.scalar(
            self._do_usuario(usuario_id).where(
                CasamentoDeOperacaoModelo.id.in_(
                    select(OperacaoDoCasamentoModelo.casamento_id).where(
                        OperacaoDoCasamentoModelo.operacao_id == operacao_id
                    )
                )
            )
        )
        return self._entidades([m])[0] if m else None

    def listar(self, usuario_id: UUID) -> list[CasamentoDeOperacao]:
        modelos = list(
            self._sessao.scalars(
                self._do_usuario(usuario_id).order_by(CasamentoDeOperacaoModelo.id)
            )
        )
        return self._entidades(modelos)

    def transacoes_casadas(self, usuario_id: UUID) -> set[UUID]:
        meus = self._do_usuario(usuario_id).with_only_columns(CasamentoDeOperacaoModelo.id)
        return set(
            self._sessao.scalars(
                select(VinculoDeCasamentoModelo.transacao_importada_id).where(
                    VinculoDeCasamentoModelo.casamento_id.in_(meus)
                )
            )
        )

    def remover(self, usuario_id: UUID, casamento_id: UUID) -> None:
        m = self._sessao.scalar(
            self._do_usuario(usuario_id).where(CasamentoDeOperacaoModelo.id == casamento_id)
        )
        if m is None:
            return
        self._sessao.execute(
            delete(VinculoDeCasamentoModelo).where(VinculoDeCasamentoModelo.casamento_id == m.id)
        )
        self._sessao.execute(
            delete(OperacaoDoCasamentoModelo).where(OperacaoDoCasamentoModelo.casamento_id == m.id)
        )
        self._sessao.delete(m)
        self._sessao.flush()
