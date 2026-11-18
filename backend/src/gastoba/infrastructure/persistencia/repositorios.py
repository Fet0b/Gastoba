"""Repositórios SQLAlchemy: implementam as portas do domain convertendo ORM ↔ entidades.

Tags comuns usam associações ordenadas; destinações possuem identidade estável por pessoa.
"""

import json
from collections.abc import Sequence
from datetime import date, datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import Select, and_, delete, exists, func, or_, select, update
from sqlalchemy.dialects import sqlite
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, aliased

from gastoba.domain.caixinha import ReferenciaMensalDaCaixinha
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.chave_de_api import ChaveDeApi, EscopoDaChave
from gastoba.domain.cobertura_de_compra import CoberturaDeCompra
from gastoba.domain.conta import Conta, OrigemDaConta, PapelDaConta, TipoDaConta
from gastoba.domain.cor_da_destinacao import CorDaDestinacao
from gastoba.domain.destinacao import ParteDeDestinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.email import Email
from gastoba.domain.excecoes import (
    ContaJaExiste,
    ContaNaoEncontrada,
    EmailJaCadastrado,
    GanhoNaoEncontrado,
    MetaNaoEncontrada,
    ReaplicacaoJaExiste,
)
from gastoba.domain.fatura import CompraDoCartao, Fatura, FonteDaFatura, PagamentoDeFatura
from gastoba.domain.ganho import Ganho, OrigemDoGanho
from gastoba.domain.gasto import Gasto, OrigemDoGasto
from gastoba.domain.historico_de_meta import AcaoDoHistoricoDeMeta, HistoricoDeMeta
from gastoba.domain.investimento import Investimento, PontoDoHistorico, Realocacao
from gastoba.domain.mes import Mes
from gastoba.domain.meta import AlvoDaMeta, Meta
from gastoba.domain.movimento_de_investimento import (
    MovimentoDeInvestimento,
    OrigemDoMovimento,
    TipoDeMovimento,
)
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.reaplicacao_de_resgate import ReaplicacaoDeResgate
from gastoba.domain.recorrencia import Recorrencia, TipoDeRecorrencia
from gastoba.domain.reversao_de_classificacao import ReversaoDeClassificacao
from gastoba.domain.senha import SenhaComHash
from gastoba.domain.sessao import Sessao
from gastoba.domain.tag import Tag
from gastoba.domain.taxa_do_investimento import TaxaDoInvestimento, taxa_do_registro
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    MotivoDaTransacaoIgnorada,
    SentidoDaTransacao,
    TransacaoImportada,
)
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.persistencia.modelos import (
    CadastroDeDestinacaoModelo,
    ChaveDeApiModelo,
    CoberturaDeCompraModelo,
    ContaModelo,
    CorDaDestinacaoModelo,
    DestinacaoModelo,
    FaturaModelo,
    GanhoModelo,
    GastoModelo,
    HistoricoDeInvestimentoModelo,
    HistoricoDeMetaModelo,
    InvestimentoModelo,
    MetaModelo,
    MovimentoDeInvestimentoModelo,
    PagamentoDeFaturaModelo,
    RealocacaoModelo,
    ReaplicacaoDeResgateModelo,
    RecorrenciaModelo,
    ReferenciaMensalDaCaixinhaModelo,
    RendaBaseModelo,
    ReversaoDeClassificacaoModelo,
    SessaoModelo,
    TagDeGanhoModelo,
    TagDeGastoModelo,
    TagDeRecorrenciaModelo,
    TagModelo,
    TransacaoImportadaModelo,
    TratamentoDeAporteModelo,
    UsuarioModelo,
)

_VIOLACAO_DO_NOME_UNICO = "UNIQUE constraint failed: contas.usuario_id, contas.nome"
_VIOLACAO_DO_EMAIL_UNICO = "UNIQUE constraint failed: usuarios.email"
# Sem o e-mail na mensagem: ele não deve acabar em logs nem em respostas de erro.
_MENSAGEM_DE_EMAIL_JA_CADASTRADO = "Já existe um usuário com este e-mail."


def _cadastro(sessao: Session, modelo, usuario_id: UUID, nome: str):
    """Cria uma identidade por pessoa/nome sem corrida entre SELECT e INSERT."""
    sessao.execute(
        sqlite.insert(modelo)
        .values(id=uuid4(), usuario_id=usuario_id, nome=nome)
        .on_conflict_do_nothing(index_elements=["usuario_id", "nome"])
    )
    return sessao.scalar(select(modelo).where(modelo.usuario_id == usuario_id, modelo.nome == nome))


def _dono_da_conta(sessao: Session, conta_id: UUID) -> UUID:
    return sessao.execute(
        select(ContaModelo.usuario_id).where(ContaModelo.id == conta_id)
    ).scalar_one()


def _dono_do_movimento(sessao: Session, movimento_id: UUID) -> UUID:
    m = sessao.get(MovimentoDeInvestimentoModelo, movimento_id)
    if m.conta_id is not None:
        return _dono_da_conta(sessao, m.conta_id)
    return sessao.execute(
        select(InvestimentoModelo.usuario_id).where(InvestimentoModelo.id == m.investimento_id)
    ).scalar_one()


def _destinacao_id(sessao: Session, usuario_id: UUID, tag: Tag) -> UUID:
    return _cadastro(sessao, CadastroDeDestinacaoModelo, usuario_id, tag.valor).id


def _tags_associadas(sessao: Session, classe, conta_id: UUID, tags: Sequence[Tag]):
    if not tags:
        return []
    usuario_id = _dono_da_conta(sessao, conta_id)
    return [
        classe(tag=_cadastro(sessao, TagModelo, usuario_id, tag.valor), ordem=ordem)
        for ordem, tag in enumerate(tags)
    ]


class RepositorioDeUsuariosSqlAlchemy:
    """Satisfaz a porta RepositorioDeUsuarios por tipagem estrutural."""

    def __init__(self, sessao: Session) -> None:
        self._sessao = sessao

    def obter(self, id: UUID) -> Usuario | None:
        modelo = self._sessao.get(UsuarioModelo, id)
        return None if modelo is None else _usuario_de(modelo)

    def obter_por_email(self, email: Email) -> Usuario | None:
        modelo = self._sessao.scalars(
            select(UsuarioModelo).where(UsuarioModelo.email == email.valor)
        ).one_or_none()
        return None if modelo is None else _usuario_de(modelo)

    def salvar(self, usuario: Usuario) -> None:
        if self._email_de_outro_usuario(usuario):
            raise EmailJaCadastrado(_MENSAGEM_DE_EMAIL_JA_CADASTRADO)
        email = None if usuario.email is None else usuario.email.valor
        senha_hash = None if usuario.senha_hash is None else usuario.senha_hash.valor
        try:
            modelo = self._sessao.get(UsuarioModelo, usuario.id)
            if modelo is None:
                self._sessao.add(
                    UsuarioModelo(
                        id=usuario.id, nome=usuario.nome, email=email, senha_hash=senha_hash
                    )
                )
            else:
                modelo.nome = usuario.nome
                modelo.email = email
                modelo.senha_hash = senha_hash
            # A verificação acima não fecha a corrida com outra transação: a UNIQUE fecha.
            self._sessao.flush()
        except IntegrityError as erro:
            if _VIOLACAO_DO_EMAIL_UNICO in str(erro.orig):
                raise EmailJaCadastrado(_MENSAGEM_DE_EMAIL_JA_CADASTRADO) from erro
            raise

    def _email_de_outro_usuario(self, usuario: Usuario) -> bool:
        if usuario.email is None:
            return False
        return bool(
            self._sessao.scalar(
                select(
                    exists().where(
                        UsuarioModelo.email == usuario.email.valor,
                        UsuarioModelo.id != usuario.id,
                    )
                )
            )
        )

    def garantir(self, usuario: Usuario) -> None:
        # Um único comando, sem SAVEPOINT: no pysqlite o RELEASE do SAVEPOINT confirmaria a
        # transação e o rollback da unidade de trabalho deixaria de desfazê-la.
        self._sessao.execute(
            sqlite.insert(UsuarioModelo)
            .values(id=usuario.id, nome=usuario.nome)
            .on_conflict_do_nothing(index_elements=["id"])
        )


class RepositorioDeContasSqlAlchemy:
    def definir_papel(self, usuario_id: UUID, conta_id: UUID, papel: PapelDaConta) -> None:
        self._sessao.execute(
            update(ContaModelo)
            .where(ContaModelo.id == conta_id, ContaModelo.usuario_id == usuario_id)
            .values(papel=papel.value)
        )

    """Satisfaz a porta RepositorioDeContas por tipagem estrutural."""

    def __init__(self, sessao: Session) -> None:
        self._sessao = sessao

    def adicionar(self, conta: Conta) -> None:
        # Checar antes evita o erro do banco, que deixaria a sessão em rollback e impediria o
        # chamador de tentar outro nome na mesma unidade de trabalho (contas do banco repetidas).
        nome_em_uso = self._sessao.scalar(
            select(
                exists().where(
                    ContaModelo.usuario_id == conta.usuario_id, ContaModelo.nome == conta.nome
                )
            )
        )
        if nome_em_uso:
            raise ContaJaExiste(f"Já existe uma conta com o nome {conta.nome!r}.")
        try:
            self._sessao.add(
                ContaModelo(
                    id=conta.id,
                    usuario_id=conta.usuario_id,
                    nome=conta.nome,
                    saldo_centavos=conta.saldo.centavos,
                    origem=conta.origem.value,
                    id_externo=conta.id_externo,
                    tipo=conta.tipo.value,
                    papel=conta.papel.value if conta.papel else None,
                )
            )
            # Sem o flush a violação só apareceria no commit, fora do repositório.
            self._sessao.flush()
        except IntegrityError as erro:
            if _VIOLACAO_DO_NOME_UNICO in str(erro.orig):
                raise ContaJaExiste(f"Já existe uma conta com o nome {conta.nome!r}.") from erro
            raise

    def obter(self, usuario_id: UUID, id: UUID) -> Conta | None:
        modelo = self._sessao.scalars(
            select(ContaModelo).where(ContaModelo.id == id, ContaModelo.usuario_id == usuario_id)
        ).one_or_none()
        return None if modelo is None else _conta_de(modelo)

    def obter_por_id_externo(self, usuario_id: UUID, id_externo: str) -> Conta | None:
        modelo = self._sessao.scalars(
            select(ContaModelo).where(
                ContaModelo.usuario_id == usuario_id, ContaModelo.id_externo == id_externo
            )
        ).one_or_none()
        return None if modelo is None else _conta_de(modelo)

    def atualizar_do_banco(self, id: UUID, saldo: Dinheiro, tipo: TipoDaConta) -> None:
        resultado = self._sessao.execute(
            update(ContaModelo)
            .where(ContaModelo.id == id)
            .values(saldo_centavos=saldo.centavos, tipo=tipo.value)
        )
        if resultado.rowcount == 0:
            raise ContaNaoEncontrada("Conta não encontrada.")

    def listar(self, usuario_id: UUID) -> list[Conta]:
        modelos = self._sessao.scalars(
            select(ContaModelo)
            .where(ContaModelo.usuario_id == usuario_id)
            .order_by(ContaModelo.nome)
        )
        return [_conta_de(m) for m in modelos]

    def excluir(self, usuario_id: UUID, id: UUID) -> None:
        recorrencias = select(RecorrenciaModelo.id).where(RecorrenciaModelo.conta_id == id)
        gastos = select(GastoModelo.id).where(
            or_(GastoModelo.conta_id == id, GastoModelo.recorrencia_id.in_(recorrencias))
        )
        self._sessao.execute(
            delete(CoberturaDeCompraModelo).where(CoberturaDeCompraModelo.gasto_id.in_(gastos))
        )
        for modelo in (GastoModelo, GanhoModelo):
            self._sessao.execute(
                delete(modelo).where(
                    or_(modelo.conta_id == id, modelo.recorrencia_id.in_(recorrencias))
                )
            )
        self._sessao.execute(
            delete(TransacaoImportadaModelo).where(TransacaoImportadaModelo.conta_id == id)
        )
        faturas = select(FaturaModelo.id).where(FaturaModelo.conta_id == id)
        self._sessao.execute(
            delete(PagamentoDeFaturaModelo).where(PagamentoDeFaturaModelo.fatura_id.in_(faturas))
        )
        self._sessao.execute(delete(FaturaModelo).where(FaturaModelo.conta_id == id))
        self._sessao.execute(delete(RecorrenciaModelo).where(RecorrenciaModelo.conta_id == id))
        resultado = self._sessao.execute(
            delete(ContaModelo).where(ContaModelo.id == id, ContaModelo.usuario_id == usuario_id)
        )
        if resultado.rowcount == 0:
            raise ContaNaoEncontrada("Conta não encontrada.")

    def debitar(self, id: UUID, valor: Dinheiro) -> None:
        # UPDATE atômico (saldo = saldo - valor): débitos simultâneos não se perdem.
        resultado = self._sessao.execute(
            update(ContaModelo)
            .where(ContaModelo.id == id)
            .values(saldo_centavos=ContaModelo.saldo_centavos - valor.centavos)
        )
        if resultado.rowcount == 0:
            raise ContaNaoEncontrada("Conta não encontrada.")

    def creditar(self, id: UUID, valor: Dinheiro) -> None:
        # UPDATE atômico (saldo = saldo + valor): créditos simultâneos não se perdem.
        resultado = self._sessao.execute(
            update(ContaModelo)
            .where(ContaModelo.id == id)
            .values(saldo_centavos=ContaModelo.saldo_centavos + valor.centavos)
        )
        if resultado.rowcount == 0:
            raise ContaNaoEncontrada("Conta não encontrada.")


class RepositorioDeGastosSqlAlchemy:
    """Satisfaz a porta RepositorioDeGastos; só enxerga gastos das contas do usuário."""

    def obter(self, usuario_id: UUID, id: UUID) -> Gasto | None:
        modelo = self._sessao.scalar(
            select(GastoModelo)
            .join(ContaModelo, GastoModelo.conta_id == ContaModelo.id)
            .where(ContaModelo.usuario_id == usuario_id, GastoModelo.id == id)
        )
        return _gasto_de(modelo) if modelo else None

    def alterar_categoria(self, id: UUID, categoria: CategoriaDoGasto) -> None:
        self._sessao.execute(
            update(GastoModelo).where(GastoModelo.id == id).values(categoria=categoria.value)
        )

    def listar_da_categoria_legada(self, usuario_id: UUID) -> list[Gasto]:
        return self.listar(usuario_id, date.min, date.max, categoria=CategoriaDoGasto.INVESTIMENTOS)

    def da_transacao(self, usuario_id: UUID, transacao_id: UUID) -> list[Gasto]:
        consulta = (
            select(GastoModelo)
            .join(ContaModelo, GastoModelo.conta_id == ContaModelo.id)
            .where(ContaModelo.usuario_id == usuario_id)
        ).where(GastoModelo.transacao_importada_id == transacao_id)
        return [_gasto_de(m) for m in self._sessao.scalars(consulta)]

    def existe_correspondente_sem_vinculo(
        self, usuario_id: UUID, conta_id: UUID, data: date, valor: Dinheiro, descricao: str
    ) -> bool:
        consulta = (
            select(GastoModelo)
            .join(ContaModelo, GastoModelo.conta_id == ContaModelo.id)
            .where(ContaModelo.usuario_id == usuario_id)
        ).where(
            GastoModelo.conta_id == conta_id,
            GastoModelo.data == data,
            GastoModelo.valor_centavos == valor.centavos,
            GastoModelo.descricao == descricao,
            GastoModelo.transacao_importada_id.is_(None),
            GastoModelo.origem == "open_finance",
        )
        return bool(self._sessao.scalar(select(consulta.exists())))

    def remover(self, id: UUID) -> None:
        self._sessao.execute(delete(GastoModelo).where(GastoModelo.id == id))
        self._sessao.flush()

    def __init__(self, sessao: Session) -> None:
        self._sessao = sessao

    def adicionar(self, gasto: Gasto) -> None:
        self._sessao.add(
            GastoModelo(
                id=gasto.id,
                conta_id=gasto.conta_id,
                descricao=gasto.descricao,
                valor_centavos=gasto.valor.centavos,
                data=gasto.data,
                tags_associadas=_tags_associadas(
                    self._sessao, TagDeGastoModelo, gasto.conta_id, gasto.tags
                ),
                categoria=gasto.categoria.value,
                origem=gasto.origem.value,
                transacao_importada_id=gasto.transacao_importada_id,
                recorrencia_id=gasto.recorrencia_id,
                competencia=gasto.competencia,
            )
        )

    def listar(
        self,
        usuario_id: UUID,
        inicio: date,
        fim: date,
        conta_id: UUID | None = None,
        tag: Tag | None = None,
        categoria: CategoriaDoGasto | None = None,
    ) -> list[Gasto]:
        consulta = (
            select(GastoModelo)
            .join(ContaModelo, GastoModelo.conta_id == ContaModelo.id)
            .where(
                ContaModelo.usuario_id == usuario_id,
                GastoModelo.data >= inicio,
                GastoModelo.data <= fim,
            )
            .order_by(GastoModelo.data.desc(), GastoModelo.id)
        )
        if conta_id is not None:
            consulta = consulta.where(GastoModelo.conta_id == conta_id)
        if tag is not None:
            consulta = consulta.where(
                exists().where(
                    TagDeGastoModelo.gasto_id == GastoModelo.id,
                    TagDeGastoModelo.tag_id == TagModelo.id,
                    TagModelo.nome == tag.valor,
                )
            )
        if categoria is not None:
            consulta = consulta.where(GastoModelo.categoria == categoria.value)
        return [_gasto_de(m) for m in self._sessao.scalars(consulta)]

    def somar_por_categoria(
        self, usuario_id: UUID, inicio: date, fim: date
    ) -> dict[CategoriaDoGasto, Dinheiro]:
        coberturas = (
            select(
                CoberturaDeCompraModelo.gasto_id,
                func.sum(CoberturaDeCompraModelo.valor_centavos).label("coberto"),
            )
            .group_by(CoberturaDeCompraModelo.gasto_id)
            .subquery()
        )
        consulta = (
            select(
                GastoModelo.categoria,
                func.sum(GastoModelo.valor_centavos - func.coalesce(coberturas.c.coberto, 0)),
            )
            .outerjoin(coberturas, coberturas.c.gasto_id == GastoModelo.id)
            .join(ContaModelo, GastoModelo.conta_id == ContaModelo.id)
            .where(
                ContaModelo.usuario_id == usuario_id,
                GastoModelo.data >= inicio,
                GastoModelo.data <= fim,
            )
            .group_by(GastoModelo.categoria)
        )
        return {
            CategoriaDoGasto(categoria): Dinheiro(int(total))
            for categoria, total in self._sessao.execute(consulta)
        }

    def competencias_geradas(self, recorrencia_id: UUID) -> set[str]:
        consulta = select(GastoModelo.competencia).where(
            GastoModelo.recorrencia_id == recorrencia_id
        )
        return {competencia for competencia in self._sessao.scalars(consulta) if competencia}

    def listar_tags(self, usuario_id: UUID) -> list[Tag]:
        consulta = (
            select(TagModelo.nome)
            .distinct()
            .join(TagDeGastoModelo, TagDeGastoModelo.tag_id == TagModelo.id)
            .join(GastoModelo, TagDeGastoModelo.gasto_id == GastoModelo.id)
            .join(ContaModelo, GastoModelo.conta_id == ContaModelo.id)
            .where(ContaModelo.usuario_id == usuario_id)
            .order_by(TagModelo.nome)
        )
        return [Tag(valor) for valor in self._sessao.scalars(consulta)]


def _tem_parte_vinculada():
    """Movimento com alguma parte que guardou a categoria de um vínculo: a categoria do próprio
    movimento (legada, do aporte inteiro) deixa de valer para ele."""
    outra = aliased(DestinacaoModelo)
    return (
        exists()
        .where(
            outra.movimento_id == MovimentoDeInvestimentoModelo.id,
            outra.categoria.is_not(None),
        )
        .correlate(MovimentoDeInvestimentoModelo)
    )


class RepositorioDeMovimentosDeInvestimentoSqlAlchemy:
    def listar_relacionados(
        self, usuario_id: UUID, ids: list[UUID]
    ) -> list[MovimentoDeInvestimento]:
        return [
            _movimento_do_modelo(m)
            for m in self._sessao.scalars(
                _movimentos_do_usuario(usuario_id).where(
                    MovimentoDeInvestimentoModelo.movimento_relacionado_id.in_(ids)
                )
            )
        ]

    """Satisfaz a porta RepositorioDeMovimentosDeInvestimento; filtra sempre pelo dono da conta."""

    def da_transacao(self, usuario_id: UUID, transacao_id: UUID) -> list[MovimentoDeInvestimento]:
        consulta = (_movimentos_do_usuario(usuario_id)).where(
            MovimentoDeInvestimentoModelo.transacao_importada_id == transacao_id,
            _sem_tratamento_aprovado(),
        )
        return [_movimento_do_modelo(m) for m in self._sessao.scalars(consulta)]

    def contar_correspondentes_sem_vinculo(
        self,
        usuario_id: UUID,
        conta_id: UUID,
        data: date,
        valor: Dinheiro,
        descricao: str,
        tipo: TipoDeMovimento,
    ) -> int:
        consulta = (_movimentos_do_usuario(usuario_id)).where(
            MovimentoDeInvestimentoModelo.conta_id == conta_id,
            MovimentoDeInvestimentoModelo.data == data,
            MovimentoDeInvestimentoModelo.valor_centavos == valor.centavos,
            MovimentoDeInvestimentoModelo.descricao == descricao,
            MovimentoDeInvestimentoModelo.transacao_importada_id.is_(None),
            MovimentoDeInvestimentoModelo.tipo == tipo.value,
        )
        return int(self._sessao.scalar(select(func.count()).select_from(consulta.subquery())) or 0)

    def existe_algum(self, usuario_id: UUID) -> bool:
        return bool(self._sessao.scalar(select(_movimentos_do_usuario(usuario_id).exists())))

    def __init__(self, sessao: Session) -> None:
        self._sessao = sessao

    def adicionar(self, movimento: MovimentoDeInvestimento) -> None:
        self._sessao.add(
            MovimentoDeInvestimentoModelo(
                id=movimento.id,
                conta_id=movimento.conta_id,
                investimento_id=movimento.investimento_id,
                tipo=movimento.tipo.value,
                movimento_relacionado_id=movimento.movimento_relacionado_id,
                descricao=movimento.descricao,
                valor_centavos=movimento.valor.centavos,
                data=movimento.data,
                origem=movimento.origem.value,
                transacao_importada_id=movimento.transacao_importada_id,
                categoria=movimento.categoria.value if movimento.categoria else None,
                revisao_pendente=movimento.revisao_pendente,
                revisao_contabil_pendente=movimento.revisao_contabil_pendente,
                vencimento_confirmado=movimento.vencimento_confirmado,
            )
        )
        self._sessao.flush()

    def somar_aportes_por_categoria(
        self, usuario_id: UUID, inicio: date, fim: date
    ) -> dict[CategoriaDoGasto, Dinheiro]:
        consulta = (
            select(
                MovimentoDeInvestimentoModelo.categoria,
                func.sum(MovimentoDeInvestimentoModelo.valor_centavos),
            )
            .join(ContaModelo, MovimentoDeInvestimentoModelo.conta_id == ContaModelo.id)
            .where(
                ContaModelo.usuario_id == usuario_id,
                MovimentoDeInvestimentoModelo.tipo == "aporte",
                MovimentoDeInvestimentoModelo.origem != "saldo_inicial",
                MovimentoDeInvestimentoModelo.categoria.is_not(None),
                ~_tem_parte_vinculada(),
                MovimentoDeInvestimentoModelo.data >= inicio,
                MovimentoDeInvestimentoModelo.data <= fim,
            )
            .group_by(MovimentoDeInvestimentoModelo.categoria)
        )
        return {CategoriaDoGasto(c): Dinheiro(int(v)) for c, v in self._sessao.execute(consulta)}

    def listar_pendentes_de_revisao(self, usuario_id: UUID) -> list[MovimentoDeInvestimento]:
        consulta = (
            _movimentos_do_usuario(usuario_id)
            .where(
                or_(
                    MovimentoDeInvestimentoModelo.revisao_pendente.is_(True),
                    MovimentoDeInvestimentoModelo.revisao_contabil_pendente.is_(True),
                ),
                MovimentoDeInvestimentoModelo.tipo == "aporte",
                MovimentoDeInvestimentoModelo.origem != "saldo_inicial",
            )
            .order_by(MovimentoDeInvestimentoModelo.data, MovimentoDeInvestimentoModelo.id)
        )
        return [_movimento_do_modelo(m) for m in self._sessao.scalars(consulta)]

    def listar_resgates_sem_destinacao(self, usuario_id: UUID) -> list[MovimentoDeInvestimento]:
        sem_tag = ~exists().where(DestinacaoModelo.movimento_id == MovimentoDeInvestimentoModelo.id)
        consulta = (
            _movimentos_do_usuario(usuario_id)
            .where(MovimentoDeInvestimentoModelo.tipo == "resgate", sem_tag)
            .order_by(MovimentoDeInvestimentoModelo.data.desc(), MovimentoDeInvestimentoModelo.id)
        )
        return [_movimento_do_modelo(m) for m in self._sessao.scalars(consulta)]

    def gravar_natureza_do_resgate(self, movimento: MovimentoDeInvestimento) -> None:
        self._sessao.execute(
            update(MovimentoDeInvestimentoModelo)
            .where(MovimentoDeInvestimentoModelo.id == movimento.id)
            .values(vencimento_confirmado=movimento.vencimento_confirmado)
        )

    def gravar_revisao(self, movimento: MovimentoDeInvestimento) -> None:
        self._sessao.execute(
            update(MovimentoDeInvestimentoModelo)
            .where(MovimentoDeInvestimentoModelo.id == movimento.id)
            .values(
                categoria=movimento.categoria.value if movimento.categoria else None,
                revisao_pendente=movimento.revisao_pendente,
                revisao_contabil_pendente=movimento.revisao_contabil_pendente,
                vencimento_confirmado=movimento.vencimento_confirmado,
            )
        )

    def somar_aportes(self, usuario_id: UUID, inicio: date, fim: date) -> Dinheiro:
        consulta = (
            select(func.coalesce(func.sum(MovimentoDeInvestimentoModelo.valor_centavos), 0))
            .join(ContaModelo, MovimentoDeInvestimentoModelo.conta_id == ContaModelo.id)
            .outerjoin(
                InvestimentoModelo,
                MovimentoDeInvestimentoModelo.investimento_id == InvestimentoModelo.id,
            )
            .where(
                ContaModelo.usuario_id == usuario_id,
                MovimentoDeInvestimentoModelo.tipo == TipoDeMovimento.APORTE.value,
                # Aplicar na conta remunerada é liquidez, não dinheiro novo: o aporte da caixinha
                # fica fora da meta (o dinheiro só conta quando vai para um ativo).
                or_(InvestimentoModelo.tipo.is_(None), InvestimentoModelo.tipo != "CAIXINHA"),
                # O saldo inicial não é dinheiro novo do mês: fica fora da meta de Investimentos.
                MovimentoDeInvestimentoModelo.origem != OrigemDoMovimento.SALDO_INICIAL.value,
                MovimentoDeInvestimentoModelo.data >= inicio,
                MovimentoDeInvestimentoModelo.data <= fim,
                _sem_tratamento_aprovado(),
            )
        )
        return Dinheiro(int(self._sessao.scalar(consulta) or 0))

    def obter(self, usuario_id: UUID, id: UUID) -> MovimentoDeInvestimento | None:
        modelo = self._sessao.scalar(
            _movimentos_do_usuario(usuario_id).where(MovimentoDeInvestimentoModelo.id == id)
        )
        return None if modelo is None else _movimento_do_modelo(modelo)

    def listar(self, usuario_id: UUID, inicio: date, fim: date) -> list[MovimentoDeInvestimento]:
        modelos = self._sessao.scalars(
            _movimentos_do_usuario(usuario_id)
            .where(
                MovimentoDeInvestimentoModelo.data >= inicio,
                MovimentoDeInvestimentoModelo.data <= fim,
                _sem_tratamento_aprovado(),
            )
            .order_by(MovimentoDeInvestimentoModelo.data.desc(), MovimentoDeInvestimentoModelo.id)
        )
        return [_movimento_do_modelo(m) for m in modelos]

    def associar(self, id: UUID, investimento_id: UUID) -> None:
        self._sessao.execute(
            update(MovimentoDeInvestimentoModelo)
            .where(MovimentoDeInvestimentoModelo.id == id)
            .values(investimento_id=investimento_id)
        )
        self._sessao.flush()

    def excluir(self, id: UUID) -> None:
        self._sessao.execute(delete(DestinacaoModelo).where(DestinacaoModelo.movimento_id == id))
        self._sessao.execute(
            delete(MovimentoDeInvestimentoModelo).where(MovimentoDeInvestimentoModelo.id == id)
        )
        self._sessao.flush()

    def investimentos_com_movimento(self, usuario_id: UUID) -> set[UUID]:
        # O dono é o do investimento, não o da conta do movimento.
        ids = self._sessao.scalars(
            select(MovimentoDeInvestimentoModelo.investimento_id)
            .join(
                InvestimentoModelo,
                MovimentoDeInvestimentoModelo.investimento_id == InvestimentoModelo.id,
            )
            .where(InvestimentoModelo.usuario_id == usuario_id)
            .distinct()
        )
        return set(ids)

    def saldos_iniciais_do_investimento(
        self, usuario_id: UUID, investimento_id: UUID
    ) -> list[MovimentoDeInvestimento]:
        modelos = self._sessao.scalars(
            select(MovimentoDeInvestimentoModelo)
            .join(
                InvestimentoModelo,
                MovimentoDeInvestimentoModelo.investimento_id == InvestimentoModelo.id,
            )
            .where(
                InvestimentoModelo.usuario_id == usuario_id,
                InvestimentoModelo.id == investimento_id,
                MovimentoDeInvestimentoModelo.origem == OrigemDoMovimento.SALDO_INICIAL.value,
            )
            .order_by(MovimentoDeInvestimentoModelo.data, MovimentoDeInvestimentoModelo.id)
        )
        return [_movimento_do_modelo(m) for m in modelos]


def _sem_tratamento_aprovado():
    """Exclui o aporte mesclado ou excluído por um tratamento ativo **e aprovado** (RF-023): o
    registro continua guardado, mas sai das listas e dos totais."""
    return ~exists().where(
        TratamentoDeAporteModelo.movimento_id == MovimentoDeInvestimentoModelo.id,
        TratamentoDeAporteModelo.desfeito_em.is_(None),
        TratamentoDeAporteModelo.aprovado_em.is_not(None),
    )


def _movimentos_do_usuario(usuario_id: UUID) -> Select[tuple[MovimentoDeInvestimentoModelo]]:
    """Os movimentos do usuário: o dono é o da conta ou, no saldo inicial (sem conta), o do
    investimento."""
    return (
        select(MovimentoDeInvestimentoModelo)
        .outerjoin(ContaModelo, MovimentoDeInvestimentoModelo.conta_id == ContaModelo.id)
        .outerjoin(
            InvestimentoModelo,
            MovimentoDeInvestimentoModelo.investimento_id == InvestimentoModelo.id,
        )
        .where(
            or_(
                ContaModelo.usuario_id == usuario_id,
                and_(
                    MovimentoDeInvestimentoModelo.conta_id.is_(None),
                    InvestimentoModelo.usuario_id == usuario_id,
                ),
            )
        )
    )


def _movimento_do_modelo(modelo: MovimentoDeInvestimentoModelo) -> MovimentoDeInvestimento:
    return MovimentoDeInvestimento(
        id=modelo.id,
        conta_id=modelo.conta_id,
        investimento_id=modelo.investimento_id,
        tipo=TipoDeMovimento(modelo.tipo),
        movimento_relacionado_id=modelo.movimento_relacionado_id,
        valor=Dinheiro(modelo.valor_centavos),
        descricao=modelo.descricao,
        data=modelo.data,
        origem=OrigemDoMovimento(modelo.origem),
        transacao_importada_id=modelo.transacao_importada_id,
        categoria=CategoriaDoGasto(modelo.categoria) if modelo.categoria else None,
        revisao_pendente=modelo.revisao_pendente,
        revisao_contabil_pendente=modelo.revisao_contabil_pendente,
        vencimento_confirmado=modelo.vencimento_confirmado,
    )


class RepositorioDeDestinacoesSqlAlchemy:
    """Satisfaz a porta RepositorioDeDestinacoes; o dono é o do investimento."""

    def somar_reservado_por_tag(
        self, usuario_id: UUID, categoria: CategoriaDoGasto
    ) -> dict[Tag, Dinheiro]:
        consulta = (
            select(DestinacaoModelo.tag, func.sum(DestinacaoModelo.valor_centavos))
            .join(
                MovimentoDeInvestimentoModelo,
                DestinacaoModelo.movimento_id == MovimentoDeInvestimentoModelo.id,
            )
            .join(ContaModelo, MovimentoDeInvestimentoModelo.conta_id == ContaModelo.id)
            .where(
                ContaModelo.usuario_id == usuario_id,
                MovimentoDeInvestimentoModelo.tipo == "aporte",
                or_(
                    DestinacaoModelo.categoria == categoria.value,
                    and_(
                        DestinacaoModelo.categoria.is_(None),
                        MovimentoDeInvestimentoModelo.categoria == categoria.value,
                        ~_tem_parte_vinculada(),
                    ),
                ),
                DestinacaoModelo.valor_centavos > 0,
            )
            .group_by(DestinacaoModelo.tag)
        )
        return {Tag(t): Dinheiro(int(v)) for t, v in self._sessao.execute(consulta)}

    def somar_partes_por_categoria(
        self, usuario_id: UUID, inicio: date, fim: date
    ) -> dict[CategoriaDoGasto, Dinheiro]:
        consulta = (
            select(DestinacaoModelo.categoria, func.sum(DestinacaoModelo.valor_centavos))
            .join(
                MovimentoDeInvestimentoModelo,
                DestinacaoModelo.movimento_id == MovimentoDeInvestimentoModelo.id,
            )
            .join(ContaModelo, MovimentoDeInvestimentoModelo.conta_id == ContaModelo.id)
            .where(
                ContaModelo.usuario_id == usuario_id,
                MovimentoDeInvestimentoModelo.tipo == "aporte",
                MovimentoDeInvestimentoModelo.origem != "saldo_inicial",
                DestinacaoModelo.categoria.is_not(None),
                DestinacaoModelo.valor_centavos > 0,
                MovimentoDeInvestimentoModelo.data >= inicio,
                MovimentoDeInvestimentoModelo.data <= fim,
            )
            .group_by(DestinacaoModelo.categoria)
        )
        return {CategoriaDoGasto(c): Dinheiro(int(v)) for c, v in self._sessao.execute(consulta)}

    def categorias_das_partes(
        self, movimento_ids: Sequence[UUID]
    ) -> dict[UUID, dict[Tag, CategoriaDoGasto]]:
        resultado: dict[UUID, dict[Tag, CategoriaDoGasto]] = {}
        if not movimento_ids:
            return resultado
        consulta = select(
            DestinacaoModelo.movimento_id, DestinacaoModelo.tag, DestinacaoModelo.categoria
        ).where(
            DestinacaoModelo.movimento_id.in_(movimento_ids),
            DestinacaoModelo.categoria.is_not(None),
        )
        for movimento_id, tag, categoria in self._sessao.execute(consulta):
            resultado.setdefault(movimento_id, {})[Tag(tag)] = CategoriaDoGasto(categoria)
        return resultado

    def resgate_da_tag(self, movimento_id: UUID, tag: Tag) -> tuple[Dinheiro, Dinheiro] | None:
        m = self._sessao.scalar(
            select(DestinacaoModelo).where(
                DestinacaoModelo.movimento_id == movimento_id,
                DestinacaoModelo.tag == str(tag),
                DestinacaoModelo.valor_centavos < 0,
            )
        )
        if m is None:
            return None
        principal = m.valor_centavos if m.principal_centavos is None else m.principal_centavos
        return Dinheiro(-m.valor_centavos), Dinheiro(-principal)

    def __init__(self, sessao: Session) -> None:
        self._sessao = sessao

    def adicionar(
        self,
        movimento_id: UUID,
        partes: Sequence[ParteDeDestinacao],
    ) -> None:
        for parte in partes:
            self._sessao.add(
                DestinacaoModelo(
                    id=uuid4(),
                    movimento_id=movimento_id,
                    destinacao_id=_destinacao_id(
                        self._sessao, _dono_do_movimento(self._sessao, movimento_id), parte.tag
                    ),
                    valor_centavos=parte.valor.centavos,
                    principal_centavos=(
                        None if parte.principal is None else parte.principal.centavos
                    ),
                    categoria=None if parte.categoria is None else parte.categoria.value,
                )
            )
        self._sessao.flush()

    def do_movimento(self, movimento_ids: Sequence[UUID]) -> dict[UUID, list[tuple[Tag, Dinheiro]]]:
        partes: dict[UUID, list[tuple[Tag, Dinheiro]]] = {}
        if not movimento_ids:
            return partes
        modelos = self._sessao.scalars(
            select(DestinacaoModelo)
            .where(DestinacaoModelo.movimento_id.in_(movimento_ids))
            .order_by(DestinacaoModelo.tag)
        )
        for m in modelos:
            partes.setdefault(m.movimento_id, []).append((Tag(m.tag), Dinheiro(m.valor_centavos)))
        return partes

    def principais(self, usuario_id: UUID) -> dict[UUID, dict[Tag, Dinheiro]]:
        totais: dict[UUID, dict[Tag, int]] = {}

        def somar(investimento_id: UUID, tag: str, centavos: int) -> None:
            por_tag = totais.setdefault(investimento_id, {})
            por_tag[Tag(tag)] = por_tag.get(Tag(tag), 0) + centavos

        dos_aportes = (
            select(
                MovimentoDeInvestimentoModelo.investimento_id,
                DestinacaoModelo.tag,
                func.sum(
                    func.coalesce(
                        DestinacaoModelo.principal_centavos, DestinacaoModelo.valor_centavos
                    )
                ),
            )
            .join(
                MovimentoDeInvestimentoModelo,
                DestinacaoModelo.movimento_id == MovimentoDeInvestimentoModelo.id,
            )
            .join(
                InvestimentoModelo,
                MovimentoDeInvestimentoModelo.investimento_id == InvestimentoModelo.id,
            )
            .where(InvestimentoModelo.usuario_id == usuario_id)
            .group_by(MovimentoDeInvestimentoModelo.investimento_id, DestinacaoModelo.tag)
        )
        for investimento_id, tag, soma in self._sessao.execute(dos_aportes):
            somar(investimento_id, tag, int(soma))
        realocacoes = (
            select(RealocacaoModelo)
            .join(InvestimentoModelo, RealocacaoModelo.investimento_id == InvestimentoModelo.id)
            .where(InvestimentoModelo.usuario_id == usuario_id)
        )
        for r in self._sessao.scalars(realocacoes):
            somar(r.investimento_id, r.tag_origem, -r.valor_centavos)
            somar(r.investimento_id, r.tag_destino, r.valor_centavos)
        return {
            investimento_id: {tag: Dinheiro(c) for tag, c in por_tag.items() if c != 0}
            for investimento_id, por_tag in totais.items()
        }

    def adicionar_realocacao(self, realocacao: Realocacao) -> None:
        self._sessao.add(
            RealocacaoModelo(
                id=realocacao.id,
                investimento_id=realocacao.investimento_id,
                data=realocacao.data,
                destinacao_origem_id=_destinacao_id(
                    self._sessao,
                    self._sessao.get(InvestimentoModelo, realocacao.investimento_id).usuario_id,
                    realocacao.origem,
                ),
                destinacao_destino_id=_destinacao_id(
                    self._sessao,
                    self._sessao.get(InvestimentoModelo, realocacao.investimento_id).usuario_id,
                    realocacao.destino,
                ),
                valor_centavos=realocacao.valor.centavos,
            )
        )
        self._sessao.flush()

    def excluir_realocacao(self, realocacao_id: UUID) -> None:
        self._sessao.execute(delete(RealocacaoModelo).where(RealocacaoModelo.id == realocacao_id))
        self._sessao.flush()

    def listar_realocacoes(self, usuario_id: UUID, investimento_id: UUID) -> list[Realocacao]:
        modelos = self._sessao.scalars(
            select(RealocacaoModelo)
            .join(InvestimentoModelo, RealocacaoModelo.investimento_id == InvestimentoModelo.id)
            .where(
                InvestimentoModelo.usuario_id == usuario_id,
                RealocacaoModelo.investimento_id == investimento_id,
            )
            .order_by(RealocacaoModelo.data.desc(), RealocacaoModelo.id)
        )
        return [
            Realocacao(
                id=m.id,
                investimento_id=m.investimento_id,
                origem=Tag(m.tag_origem),
                destino=Tag(m.tag_destino),
                valor=Dinheiro(m.valor_centavos),
                data=m.data,
            )
            for m in modelos
        ]


class RepositorioDeInvestimentosSqlAlchemy:
    def definir_referencia_da_caixinha(self, referencia: ReferenciaMensalDaCaixinha) -> None:
        self._sessao.merge(
            ReferenciaMensalDaCaixinhaModelo(
                investimento_id=referencia.investimento_id,
                mes=str(referencia.mes),
                saldo_inicial_centavos=referencia.saldo_inicial.centavos,
                saldo_final_centavos=referencia.saldo_final.centavos,
                periodo_completo=referencia.periodo_completo,
            )
        )

    def referencia_da_caixinha(
        self, investimento_id: UUID, mes: Mes
    ) -> ReferenciaMensalDaCaixinha | None:
        m = self._sessao.get(ReferenciaMensalDaCaixinhaModelo, (investimento_id, str(mes)))
        return (
            ReferenciaMensalDaCaixinha(
                investimento_id,
                mes,
                Dinheiro(m.saldo_inicial_centavos),
                Dinheiro(m.saldo_final_centavos),
                m.periodo_completo,
            )
            if m
            else None
        )

    """Satisfaz a porta RepositorioDeInvestimentos; cada usuário só enxerga as próprias posições."""

    def existe_algum(self, usuario_id: UUID) -> bool:
        return bool(
            self._sessao.scalar(select(exists().where(InvestimentoModelo.usuario_id == usuario_id)))
        )

    def __init__(self, sessao: Session) -> None:
        self._sessao = sessao

    def salvar_posicao(
        self, usuario_id: UUID, investimento: InvestimentoExterno, hoje: date | None = None
    ) -> None:
        modelo = self._sessao.scalar(
            select(InvestimentoModelo).where(
                InvestimentoModelo.usuario_id == usuario_id,
                InvestimentoModelo.id_externo == investimento.id_externo,
            )
        )
        if modelo is None:
            modelo = InvestimentoModelo(
                id=uuid4(), usuario_id=usuario_id, id_externo=investimento.id_externo
            )
            self._sessao.add(modelo)
        modelo.nome = investimento.nome
        modelo.tipo = investimento.tipo
        modelo.subtipo = investimento.subtipo
        modelo.saldo_centavos = investimento.saldo.centavos
        aplicado, rendimento = investimento.valor_aplicado, investimento.rendimento
        modelo.valor_aplicado_centavos = None if aplicado is None else aplicado.centavos
        modelo.rendimento_centavos = None if rendimento is None else rendimento.centavos
        modelo.dados = investimento.dados
        modelo.conta_remunerada_id = investimento.conta_remunerada_id
        self._sessao.flush()
        if hoje is not None:
            self._registrar_saldo_do_dia(modelo.id, hoje, investimento.saldo)

    def _registrar_saldo_do_dia(self, investimento_id: UUID, dia: date, saldo: Dinheiro) -> None:
        registro = self._sessao.scalar(
            select(HistoricoDeInvestimentoModelo).where(
                HistoricoDeInvestimentoModelo.investimento_id == investimento_id,
                HistoricoDeInvestimentoModelo.data == dia,
            )
        )
        if registro is None:
            registro = HistoricoDeInvestimentoModelo(
                id=uuid4(), investimento_id=investimento_id, data=dia
            )
            self._sessao.add(registro)
        registro.saldo_centavos = saldo.centavos
        self._sessao.flush()

    def listar_posicoes(self, usuario_id: UUID) -> list[Investimento]:
        modelos = self._sessao.scalars(
            select(InvestimentoModelo)
            .where(InvestimentoModelo.usuario_id == usuario_id)
            .order_by(InvestimentoModelo.nome, InvestimentoModelo.id_externo)
        )
        ultimos = dict(
            self._sessao.execute(
                select(
                    HistoricoDeInvestimentoModelo.investimento_id,
                    func.max(HistoricoDeInvestimentoModelo.data),
                ).group_by(HistoricoDeInvestimentoModelo.investimento_id)
            ).all()
        )
        return [_investimento_do_modelo(m, ultimos.get(m.id)) for m in modelos]

    def obter(self, usuario_id: UUID, id: UUID) -> Investimento | None:
        modelo = self._sessao.scalar(
            select(InvestimentoModelo).where(
                InvestimentoModelo.id == id, InvestimentoModelo.usuario_id == usuario_id
            )
        )
        return None if modelo is None else _investimento_do_modelo(modelo, None)

    def historico(self, usuario_id: UUID, inicio: date, fim: date) -> list[PontoDoHistorico]:
        registros = self._sessao.scalars(
            select(HistoricoDeInvestimentoModelo)
            .join(
                InvestimentoModelo,
                HistoricoDeInvestimentoModelo.investimento_id == InvestimentoModelo.id,
            )
            .where(
                InvestimentoModelo.usuario_id == usuario_id,
                HistoricoDeInvestimentoModelo.data >= inicio,
                HistoricoDeInvestimentoModelo.data <= fim,
            )
            .order_by(
                HistoricoDeInvestimentoModelo.data, HistoricoDeInvestimentoModelo.investimento_id
            )
        )
        return [
            PontoDoHistorico(r.investimento_id, r.data, Dinheiro(r.saldo_centavos))
            for r in registros
        ]

    def saldo_antes_de(self, usuario_id: UUID, id: UUID, data: date) -> Dinheiro | None:
        centavos = self._sessao.scalar(
            select(HistoricoDeInvestimentoModelo.saldo_centavos)
            .join(
                InvestimentoModelo,
                HistoricoDeInvestimentoModelo.investimento_id == InvestimentoModelo.id,
            )
            .where(
                InvestimentoModelo.usuario_id == usuario_id,
                InvestimentoModelo.id == id,
                HistoricoDeInvestimentoModelo.data < data,
            )
            .order_by(HistoricoDeInvestimentoModelo.data.desc())
            .limit(1)
        )
        return None if centavos is None else Dinheiro(centavos)

    def listar(self, usuario_id: UUID) -> list[InvestimentoExterno]:
        modelos = self._sessao.scalars(
            select(InvestimentoModelo)
            .where(InvestimentoModelo.usuario_id == usuario_id)
            .order_by(InvestimentoModelo.nome, InvestimentoModelo.id_externo)
        )
        return [
            InvestimentoExterno(
                id_externo=m.id_externo,
                nome=m.nome,
                tipo=m.tipo,
                subtipo=m.subtipo,
                saldo=Dinheiro(m.saldo_centavos),
                dados=m.dados,
                valor_aplicado=_dinheiro_ou_nulo(m.valor_aplicado_centavos),
                rendimento=_dinheiro_ou_nulo(m.rendimento_centavos),
            )
            for m in modelos
        ]


class RepositorioDeTransacoesImportadasSqlAlchemy:
    def reservar_reversao(
        self, transacao_id: UUID, estado_anterior: EstadoDaTransacaoImportada, reversoes: int
    ) -> bool:
        contagem = (
            select(func.count())
            .select_from(ReversaoDeClassificacaoModelo)
            .where(ReversaoDeClassificacaoModelo.transacao_id == transacao_id)
            .scalar_subquery()
        )
        resultado = self._sessao.execute(
            update(TransacaoImportadaModelo)
            .where(
                TransacaoImportadaModelo.id == transacao_id,
                TransacaoImportadaModelo.estado == estado_anterior.value,
                contagem == reversoes,
            )
            .values(estado=EstadoDaTransacaoImportada.PENDENTE.value, motivo_ignorada=None)
        )
        return resultado.rowcount == 1

    def contar_reversoes(self, transacao_id: UUID) -> int:
        return (
            self._sessao.scalar(
                select(func.count())
                .select_from(ReversaoDeClassificacaoModelo)
                .where(ReversaoDeClassificacaoModelo.transacao_id == transacao_id)
            )
            or 0
        )

    def abatimentos_da_transacao(self, usuario_id: UUID, transacao_id: UUID) -> list[dict]:
        registros = self._sessao.scalars(
            select(ReversaoDeClassificacaoModelo)
            .where(
                ReversaoDeClassificacaoModelo.usuario_id == usuario_id,
                ReversaoDeClassificacaoModelo.transacao_id == transacao_id,
            )
            .order_by(ReversaoDeClassificacaoModelo.instante, ReversaoDeClassificacaoModelo.id)
        ).all()
        return [
            r
            for registro in registros
            for r in registro.lancamentos
            if r.get("tipo") == "AbatimentoDeSaldoInicial"
        ]

    def registrar_reversao(self, reversao: ReversaoDeClassificacao) -> None:
        self._sessao.add(
            ReversaoDeClassificacaoModelo(
                id=reversao.id,
                usuario_id=reversao.usuario_id,
                transacao_id=reversao.transacao_id,
                estado_anterior=reversao.estado_anterior,
                instante=reversao.instante,
                lancamentos=list(reversao.lancamentos),
            )
        )

    """Satisfaz a porta RepositorioDeTransacoesImportadas; só enxerga contas do usuário."""

    def aceitas_correspondentes_sem_vinculo(
        self,
        usuario_id: UUID,
        conta_id: UUID,
        data: date,
        valor: Dinheiro,
        descricao: str,
        sentido: SentidoDaTransacao,
    ) -> list[TransacaoImportada]:
        consulta = (
            select(TransacaoImportadaModelo)
            .join(ContaModelo, TransacaoImportadaModelo.conta_id == ContaModelo.id)
            .where(
                ContaModelo.usuario_id == usuario_id,
                TransacaoImportadaModelo.conta_id == conta_id,
                TransacaoImportadaModelo.data == data,
                TransacaoImportadaModelo.valor_centavos == valor.centavos,
                TransacaoImportadaModelo.descricao == descricao,
                TransacaoImportadaModelo.sentido == sentido.value,
                TransacaoImportadaModelo.estado == EstadoDaTransacaoImportada.ACEITA.value,
            )
        )
        for modelo in (GastoModelo, GanhoModelo, MovimentoDeInvestimentoModelo):
            consulta = consulta.where(
                ~exists(
                    select(modelo.id).where(
                        modelo.transacao_importada_id == TransacaoImportadaModelo.id
                    )
                )
            )
        return [_transacao_importada_de(m) for m in self._sessao.scalars(consulta)]

    def __init__(self, sessao: Session) -> None:
        self._sessao = sessao

    def adicionar_se_nova(self, transacao: TransacaoImportada) -> bool:
        ja_existe = self._sessao.scalar(
            select(
                exists().where(
                    TransacaoImportadaModelo.conta_id == transacao.conta_id,
                    TransacaoImportadaModelo.id_externo == transacao.id_externo,
                )
            )
        )
        if ja_existe:
            return False
        self._sessao.add(
            TransacaoImportadaModelo(
                id=transacao.id,
                conta_id=transacao.conta_id,
                id_externo=transacao.id_externo,
                motivo_ignorada=transacao.motivo_ignorada,
                data=transacao.data,
                descricao=transacao.descricao,
                valor_centavos=transacao.valor.centavos,
                sentido=transacao.sentido.value,
                tipo_de_operacao=transacao.tipo_de_operacao,
                estado=transacao.estado.value,
                id_externo_da_fatura=transacao.id_externo_da_fatura,
                parcela_numero=transacao.parcela_numero,
                parcela_total=transacao.parcela_total,
            )
        )
        self._sessao.flush()
        return True

    def obter(self, usuario_id: UUID, id: UUID) -> TransacaoImportada | None:
        modelo = self._sessao.scalar(
            select(TransacaoImportadaModelo)
            .join(ContaModelo, TransacaoImportadaModelo.conta_id == ContaModelo.id)
            .where(TransacaoImportadaModelo.id == id, ContaModelo.usuario_id == usuario_id)
        )
        return _transacao_importada_de(modelo) if modelo is not None else None

    def listar(
        self, usuario_id: UUID, estado: EstadoDaTransacaoImportada
    ) -> list[TransacaoImportada]:
        consulta = (
            select(TransacaoImportadaModelo)
            .join(ContaModelo, TransacaoImportadaModelo.conta_id == ContaModelo.id)
            .where(
                ContaModelo.usuario_id == usuario_id,
                TransacaoImportadaModelo.estado == estado.value,
            )
            .order_by(TransacaoImportadaModelo.data.desc(), TransacaoImportadaModelo.id)
        )
        return [_transacao_importada_de(m) for m in self._sessao.scalars(consulta)]

    def atualizar_estado(self, transacao: TransacaoImportada) -> None:
        self._sessao.execute(
            update(TransacaoImportadaModelo)
            .where(TransacaoImportadaModelo.id == transacao.id)
            .values(estado=transacao.estado.value, motivo_ignorada=transacao.motivo_ignorada)
        )

    def data_mais_recente(self, conta_id: UUID) -> date | None:
        return self._sessao.scalar(
            select(func.max(TransacaoImportadaModelo.data)).where(
                TransacaoImportadaModelo.conta_id == conta_id
            )
        )


class RepositorioDeGanhosSqlAlchemy:
    """Satisfaz a porta RepositorioDeGanhos; só enxerga ganhos das contas do usuário."""

    def da_transacao(self, usuario_id: UUID, transacao_id: UUID) -> list[Ganho]:
        consulta = (
            select(GanhoModelo)
            .join(ContaModelo, GanhoModelo.conta_id == ContaModelo.id)
            .where(ContaModelo.usuario_id == usuario_id)
        ).where(GanhoModelo.transacao_importada_id == transacao_id)
        return [_ganho_de(m) for m in self._sessao.scalars(consulta)]

    def existe_correspondente_sem_vinculo(
        self, usuario_id: UUID, conta_id: UUID, data: date, valor: Dinheiro, descricao: str
    ) -> bool:
        consulta = (
            select(GanhoModelo)
            .join(ContaModelo, GanhoModelo.conta_id == ContaModelo.id)
            .where(ContaModelo.usuario_id == usuario_id)
        ).where(
            GanhoModelo.conta_id == conta_id,
            GanhoModelo.data == data,
            GanhoModelo.valor_centavos == valor.centavos,
            GanhoModelo.descricao == descricao,
            GanhoModelo.transacao_importada_id.is_(None),
            GanhoModelo.origem == "open_finance",
        )
        return bool(self._sessao.scalar(select(consulta.exists())))

    def __init__(self, sessao: Session) -> None:
        self._sessao = sessao

    def adicionar(self, ganho: Ganho) -> None:
        self._sessao.add(
            GanhoModelo(
                id=ganho.id,
                conta_id=ganho.conta_id,
                descricao=ganho.descricao,
                valor_centavos=ganho.valor.centavos,
                data=ganho.data,
                tags_associadas=_tags_associadas(
                    self._sessao, TagDeGanhoModelo, ganho.conta_id, ganho.tags
                ),
                origem=ganho.origem.value,
                transacao_importada_id=ganho.transacao_importada_id,
                recorrencia_id=ganho.recorrencia_id,
                competencia=ganho.competencia,
            )
        )

    def obter(self, usuario_id: UUID, id: UUID) -> Ganho | None:
        modelo = self._sessao.scalar(
            select(GanhoModelo)
            .join(ContaModelo, GanhoModelo.conta_id == ContaModelo.id)
            .where(GanhoModelo.id == id, ContaModelo.usuario_id == usuario_id)
        )
        return _ganho_de(modelo) if modelo is not None else None

    def remover(self, id: UUID) -> None:
        resultado = self._sessao.execute(delete(GanhoModelo).where(GanhoModelo.id == id))
        if resultado.rowcount == 0:
            raise GanhoNaoEncontrado("Ganho não encontrado.")

    def listar(
        self,
        usuario_id: UUID,
        inicio: date,
        fim: date,
        conta_id: UUID | None = None,
    ) -> list[Ganho]:
        consulta = (
            select(GanhoModelo)
            .join(ContaModelo, GanhoModelo.conta_id == ContaModelo.id)
            .where(
                ContaModelo.usuario_id == usuario_id,
                GanhoModelo.data >= inicio,
                GanhoModelo.data <= fim,
            )
            .order_by(GanhoModelo.data.desc(), GanhoModelo.id)
        )
        if conta_id is not None:
            consulta = consulta.where(GanhoModelo.conta_id == conta_id)
        return [_ganho_de(m) for m in self._sessao.scalars(consulta)]

    def somar(self, usuario_id: UUID, inicio: date, fim: date) -> Dinheiro:
        consulta = (
            select(func.coalesce(func.sum(GanhoModelo.valor_centavos), 0))
            .join(ContaModelo, GanhoModelo.conta_id == ContaModelo.id)
            .where(
                ContaModelo.usuario_id == usuario_id,
                GanhoModelo.data >= inicio,
                GanhoModelo.data <= fim,
            )
        )
        return Dinheiro(int(self._sessao.scalar(consulta) or 0))

    def competencias_geradas(self, recorrencia_id: UUID) -> set[str]:
        consulta = select(GanhoModelo.competencia).where(
            GanhoModelo.recorrencia_id == recorrencia_id
        )
        return {competencia for competencia in self._sessao.scalars(consulta) if competencia}


class RepositorioDeRecorrenciasSqlAlchemy:
    """Satisfaz a porta RepositorioDeRecorrencias; filtra sempre pelo usuário dono.

    O dono é o da conta da recorrência: a tabela não guarda o usuário, para não haver duas
    fontes da verdade."""

    def listar_da_categoria_legada(self, usuario_id: UUID) -> list[Recorrencia]:
        return [r for r in self.listar(usuario_id) if r.categoria == CategoriaDoGasto.INVESTIMENTOS]

    def alterar_categoria(self, id: UUID, categoria: CategoriaDoGasto) -> None:
        self._sessao.execute(
            update(RecorrenciaModelo)
            .where(RecorrenciaModelo.id == id)
            .values(categoria=categoria.value)
        )

    def __init__(self, sessao: Session) -> None:
        self._sessao = sessao

    def adicionar(self, recorrencia: Recorrencia) -> None:
        self._sessao.add(
            RecorrenciaModelo(
                id=recorrencia.id,
                tipo=recorrencia.tipo.value,
                conta_id=recorrencia.conta_id,
                valor_centavos=recorrencia.valor.centavos,
                descricao=recorrencia.descricao,
                dia_do_mes=recorrencia.dia_do_mes,
                inicio=recorrencia.inicio,
                fim=recorrencia.fim,
                categoria=recorrencia.categoria.value if recorrencia.categoria else None,
                tags_associadas=_tags_associadas(
                    self._sessao, TagDeRecorrenciaModelo, recorrencia.conta_id, recorrencia.tags
                ),
                ativa=recorrencia.ativa,
            )
        )

    def obter(self, usuario_id: UUID, id: UUID) -> Recorrencia | None:
        linha = self._sessao.execute(
            _recorrencias_do_usuario(usuario_id).where(RecorrenciaModelo.id == id)
        ).first()
        return _recorrencia_de(linha[0], linha[1]) if linha else None

    def listar(self, usuario_id: UUID) -> list[Recorrencia]:
        consulta = _recorrencias_do_usuario(usuario_id).order_by(
            RecorrenciaModelo.descricao, RecorrenciaModelo.id
        )
        return [_recorrencia_de(m, dono) for m, dono in self._sessao.execute(consulta)]

    def contar_ativas(self, usuario_id: UUID) -> int:
        consulta = (
            select(func.count())
            .select_from(RecorrenciaModelo)
            .join(ContaModelo, RecorrenciaModelo.conta_id == ContaModelo.id)
            .where(ContaModelo.usuario_id == usuario_id, RecorrenciaModelo.ativa.is_(True))
        )
        return int(self._sessao.scalar(consulta) or 0)

    def listar_ativas(self, usuario_id: UUID | None = None) -> list[Recorrencia]:
        consulta = (
            select(RecorrenciaModelo, ContaModelo.usuario_id)
            .join(ContaModelo, RecorrenciaModelo.conta_id == ContaModelo.id)
            .where(RecorrenciaModelo.ativa.is_(True))
            .order_by(RecorrenciaModelo.inicio, RecorrenciaModelo.id)
        )
        if usuario_id is not None:
            consulta = consulta.where(ContaModelo.usuario_id == usuario_id)
        return [_recorrencia_de(m, dono) for m, dono in self._sessao.execute(consulta)]

    def atualizar(self, recorrencia: Recorrencia) -> None:
        self._sessao.execute(
            update(RecorrenciaModelo)
            .where(
                RecorrenciaModelo.id == recorrencia.id,
                RecorrenciaModelo.conta_id.in_(
                    select(ContaModelo.id).where(ContaModelo.usuario_id == recorrencia.usuario_id)
                ),
            )
            .values(
                valor_centavos=recorrencia.valor.centavos,
                descricao=recorrencia.descricao,
                dia_do_mes=recorrencia.dia_do_mes,
                categoria=recorrencia.categoria.value if recorrencia.categoria else None,
                fim=recorrencia.fim,
                ativa=recorrencia.ativa,
            )
        )

        modelo = self._sessao.get(RecorrenciaModelo, recorrencia.id)
        if (
            modelo is not None
            and _dono_da_conta(self._sessao, modelo.conta_id) == recorrencia.usuario_id
        ):
            modelo.tags_associadas.clear()
            self._sessao.flush()
            modelo.tags_associadas = _tags_associadas(
                self._sessao, TagDeRecorrenciaModelo, modelo.conta_id, recorrencia.tags
            )


class RepositorioDeRendaBaseSqlAlchemy:
    def __init__(self, sessao: Session) -> None:
        self._sessao = sessao

    def obter(self, usuario_id: UUID) -> Dinheiro | None:
        modelo = self._sessao.get(RendaBaseModelo, usuario_id)
        return None if modelo is None else Dinheiro(modelo.valor_centavos)

    def definir(self, usuario_id: UUID, valor: Dinheiro) -> None:
        inserir = sqlite.insert(RendaBaseModelo).values(
            usuario_id=usuario_id, valor_centavos=valor.centavos
        )
        self._sessao.execute(
            inserir.on_conflict_do_update(
                index_elements=[RendaBaseModelo.usuario_id],
                set_={"valor_centavos": inserir.excluded.valor_centavos},
            )
        )

    def remover(self, usuario_id: UUID) -> None:
        self._sessao.execute(
            delete(RendaBaseModelo).where(RendaBaseModelo.usuario_id == usuario_id)
        )


class RepositorioDeHistoricoDeMetasSqlAlchemy:
    def __init__(self, sessao: Session) -> None:
        self._sessao = sessao

    def registrar(self, registro: HistoricoDeMeta) -> None:
        self._sessao.add(
            HistoricoDeMetaModelo(
                id=registro.id,
                usuario_id=registro.usuario_id,
                categoria=registro.alvo.value,
                percentual_anterior=registro.percentual_anterior,
                percentual_novo=registro.percentual_novo,
                acao=registro.acao.value,
                instante=registro.instante,
            )
        )

    def listar(self, usuario_id: UUID, limite: int = 100) -> list[HistoricoDeMeta]:
        consulta = (
            select(HistoricoDeMetaModelo)
            .where(HistoricoDeMetaModelo.usuario_id == usuario_id)
            .order_by(HistoricoDeMetaModelo.instante.desc(), HistoricoDeMetaModelo.id.desc())
            .limit(min(limite, 100))
        )
        return [
            HistoricoDeMeta(
                m.usuario_id,
                AlvoDaMeta(m.categoria),
                m.percentual_anterior,
                m.percentual_novo,
                AcaoDoHistoricoDeMeta(m.acao),
                m.instante,
                m.id,
            )
            for m in self._sessao.scalars(consulta)
        ]


class RepositorioDeMetasSqlAlchemy:
    def bloquear(self, usuario_id: UUID) -> None:
        # SQLite: obtém a reserva de escrita antes da leitura, inclusive sem metas.
        self._sessao.execute(
            update(MetaModelo)
            .where(MetaModelo.usuario_id == usuario_id)
            .values(percentual=MetaModelo.percentual)
        )

    """Satisfaz a porta RepositorioDeMetas; filtra sempre pelo usuário dono."""

    def __init__(self, sessao: Session) -> None:
        self._sessao = sessao

    def obter(self, usuario_id: UUID, categoria: AlvoDaMeta) -> Meta | None:
        modelo = self._sessao.scalar(
            select(MetaModelo).where(
                MetaModelo.usuario_id == usuario_id, MetaModelo.categoria == categoria.value
            )
        )
        return _meta_de(modelo) if modelo else None

    def listar(self, usuario_id: UUID) -> list[Meta]:
        modelos = self._sessao.scalars(
            select(MetaModelo).where(MetaModelo.usuario_id == usuario_id)
        )
        ordem = {categoria.value: posicao for posicao, categoria in enumerate(AlvoDaMeta)}
        return [
            _meta_de(m) for m in sorted(modelos, key=lambda m: ordem.get(m.categoria, len(ordem)))
        ]

    def salvar(self, meta: Meta) -> None:
        existente = self._sessao.scalar(
            select(MetaModelo).where(
                MetaModelo.usuario_id == meta.usuario_id,
                MetaModelo.categoria == meta.alvo.value,
            )
        )
        if existente is not None:
            existente.percentual = meta.percentual
            return
        self._sessao.add(
            MetaModelo(
                id=meta.id,
                usuario_id=meta.usuario_id,
                categoria=meta.alvo.value,
                percentual=meta.percentual,
            )
        )

    def remover(self, usuario_id: UUID, categoria: AlvoDaMeta) -> None:
        resultado = self._sessao.execute(
            delete(MetaModelo).where(
                MetaModelo.usuario_id == usuario_id, MetaModelo.categoria == categoria.value
            )
        )
        if resultado.rowcount == 0:
            raise MetaNaoEncontrada("Meta não encontrada.")


class RepositorioDeSessoesSqlAlchemy:
    """Satisfaz a porta RepositorioDeSessoes; só o hash do token chega ao banco."""

    def __init__(self, sessao: Session) -> None:
        self._sessao = sessao

    def adicionar(self, sessao: Sessao) -> None:
        self._sessao.add(
            SessaoModelo(
                id=sessao.id,
                usuario_id=sessao.usuario_id,
                hash_do_segredo=sessao.hash_do_segredo,
                criada_em=sessao.criada_em,
                expira_em=sessao.expira_em,
                revogada=sessao.revogada,
            )
        )

    def obter_por_hash(self, hash_do_segredo: str) -> Sessao | None:
        modelo = self._sessao.scalars(
            select(SessaoModelo).where(SessaoModelo.hash_do_segredo == hash_do_segredo)
        ).one_or_none()
        return None if modelo is None else _sessao_de(modelo)

    def revogar(self, id: UUID) -> None:
        self._sessao.execute(
            update(SessaoModelo).where(SessaoModelo.id == id).values(revogada=True)
        )


class RepositorioDeChavesDeApiSqlAlchemy:
    """Satisfaz a porta RepositorioDeChavesDeApi; só o hash do segredo chega ao banco."""

    def __init__(self, sessao: Session) -> None:
        self._sessao = sessao

    def adicionar(self, chave: ChaveDeApi) -> None:
        self._sessao.add(
            ChaveDeApiModelo(
                id=chave.id,
                usuario_id=chave.usuario_id,
                nome=chave.nome,
                prefixo=chave.prefixo,
                hash_do_segredo=chave.hash_do_segredo,
                escopo=chave.escopo.value,
                criada_em=chave.criada_em,
                ultimo_uso=chave.ultimo_uso,
                expira_em=chave.expira_em,
                revogada=chave.revogada,
            )
        )

    def obter(self, usuario_id: UUID, id: UUID) -> ChaveDeApi | None:
        modelo = self._sessao.scalars(
            select(ChaveDeApiModelo).where(
                ChaveDeApiModelo.id == id, ChaveDeApiModelo.usuario_id == usuario_id
            )
        ).one_or_none()
        return None if modelo is None else _chave_de(modelo)

    def obter_por_hash(self, hash_do_segredo: str) -> ChaveDeApi | None:
        modelo = self._sessao.scalars(
            select(ChaveDeApiModelo).where(ChaveDeApiModelo.hash_do_segredo == hash_do_segredo)
        ).one_or_none()
        return None if modelo is None else _chave_de(modelo)

    def listar(self, usuario_id: UUID) -> list[ChaveDeApi]:
        modelos = self._sessao.scalars(
            select(ChaveDeApiModelo)
            .where(ChaveDeApiModelo.usuario_id == usuario_id, ChaveDeApiModelo.revogada.is_(False))
            .order_by(ChaveDeApiModelo.criada_em.desc(), ChaveDeApiModelo.id)
        )
        return [_chave_de(m) for m in modelos]

    def revogar(self, id: UUID) -> None:
        self._sessao.execute(
            update(ChaveDeApiModelo).where(ChaveDeApiModelo.id == id).values(revogada=True)
        )

    def registrar_uso(self, id: UUID, quando: datetime) -> None:
        # UPDATE único e condicional: entre requisições concorrentes, uma mais antiga que
        # chegue por último não faz o ``ultimo_uso`` voltar no tempo.
        self._sessao.execute(
            update(ChaveDeApiModelo)
            .where(
                ChaveDeApiModelo.id == id,
                or_(ChaveDeApiModelo.ultimo_uso.is_(None), ChaveDeApiModelo.ultimo_uso < quando),
            )
            .values(ultimo_uso=quando)
        )


def _usuario_de(modelo: UsuarioModelo) -> Usuario:
    return Usuario(
        nome=modelo.nome,
        id=modelo.id,
        email=None if modelo.email is None else Email(modelo.email),
        senha_hash=None if modelo.senha_hash is None else SenhaComHash(modelo.senha_hash),
    )


def _sessao_de(modelo: SessaoModelo) -> Sessao:
    return Sessao(
        usuario_id=modelo.usuario_id,
        hash_do_segredo=modelo.hash_do_segredo,
        criada_em=modelo.criada_em,
        expira_em=modelo.expira_em,
        revogada=modelo.revogada,
        id=modelo.id,
    )


def _chave_de(modelo: ChaveDeApiModelo) -> ChaveDeApi:
    return ChaveDeApi(
        usuario_id=modelo.usuario_id,
        nome=modelo.nome,
        prefixo=modelo.prefixo,
        hash_do_segredo=modelo.hash_do_segredo,
        escopo=EscopoDaChave(modelo.escopo),
        criada_em=modelo.criada_em,
        ultimo_uso=modelo.ultimo_uso,
        expira_em=modelo.expira_em,
        revogada=modelo.revogada,
        id=modelo.id,
    )


def _conta_de(modelo: ContaModelo) -> Conta:
    return Conta(
        usuario_id=modelo.usuario_id,
        nome=modelo.nome,
        saldo=Dinheiro(modelo.saldo_centavos),
        origem=OrigemDaConta(modelo.origem),
        id_externo=modelo.id_externo,
        id=modelo.id,
        tipo=TipoDaConta(modelo.tipo),
        papel=PapelDaConta(modelo.papel) if modelo.papel else None,
    )


def _transacao_importada_de(modelo: TransacaoImportadaModelo) -> TransacaoImportada:
    return TransacaoImportada(
        conta_id=modelo.conta_id,
        id_externo=modelo.id_externo,
        data=modelo.data,
        descricao=modelo.descricao,
        valor=Dinheiro(modelo.valor_centavos),
        sentido=SentidoDaTransacao(modelo.sentido),
        tipo_de_operacao=modelo.tipo_de_operacao,
        estado=EstadoDaTransacaoImportada(modelo.estado),
        motivo_ignorada=MotivoDaTransacaoIgnorada(modelo.motivo_ignorada)
        if modelo.motivo_ignorada
        else None,
        id=modelo.id,
        id_externo_da_fatura=modelo.id_externo_da_fatura,
        parcela_numero=modelo.parcela_numero,
        parcela_total=modelo.parcela_total,
    )


def _recorrencias_do_usuario(usuario_id: UUID) -> Select[tuple[RecorrenciaModelo, UUID]]:
    """As recorrências do usuário com o dono, que vem da conta."""
    return (
        select(RecorrenciaModelo, ContaModelo.usuario_id)
        .join(ContaModelo, RecorrenciaModelo.conta_id == ContaModelo.id)
        .where(ContaModelo.usuario_id == usuario_id)
    )


def _recorrencia_de(modelo: RecorrenciaModelo, usuario_id: UUID) -> Recorrencia:
    return Recorrencia(
        usuario_id=usuario_id,
        tipo=TipoDeRecorrencia(modelo.tipo),
        conta_id=modelo.conta_id,
        valor=Dinheiro(modelo.valor_centavos),
        descricao=modelo.descricao,
        dia_do_mes=modelo.dia_do_mes,
        inicio=modelo.inicio,
        categoria=CategoriaDoGasto(modelo.categoria) if modelo.categoria else None,
        tags=tuple(Tag(valor) for valor in modelo.tags),
        fim=modelo.fim,
        ativa=modelo.ativa,
        id=modelo.id,
    )


def _meta_de(modelo: MetaModelo) -> Meta:
    return Meta(
        usuario_id=modelo.usuario_id,
        alvo=AlvoDaMeta(modelo.categoria),
        percentual=modelo.percentual,
        id=modelo.id,
    )


def _ganho_de(modelo: GanhoModelo) -> Ganho:
    return Ganho(
        conta_id=modelo.conta_id,
        valor=Dinheiro(modelo.valor_centavos),
        descricao=modelo.descricao,
        data=modelo.data,
        tags=tuple(Tag(valor) for valor in modelo.tags),
        origem=OrigemDoGanho(modelo.origem),
        transacao_importada_id=modelo.transacao_importada_id,
        recorrencia_id=modelo.recorrencia_id,
        competencia=modelo.competencia,
        id=modelo.id,
    )


def _gasto_de(modelo: GastoModelo) -> Gasto:
    return Gasto(
        conta_id=modelo.conta_id,
        valor=Dinheiro(modelo.valor_centavos),
        descricao=modelo.descricao,
        data=modelo.data,
        categoria=CategoriaDoGasto(modelo.categoria),
        tags=tuple(Tag(valor) for valor in modelo.tags),
        origem=OrigemDoGasto(modelo.origem),
        transacao_importada_id=modelo.transacao_importada_id,
        recorrencia_id=modelo.recorrencia_id,
        competencia=modelo.competencia,
        id=modelo.id,
    )


def _investimento_do_modelo(modelo: InvestimentoModelo, atualizado_em: date | None) -> Investimento:
    return Investimento(
        id=modelo.id,
        id_externo=modelo.id_externo,
        nome=modelo.nome,
        tipo=modelo.tipo,
        subtipo=modelo.subtipo,
        saldo=Dinheiro(modelo.saldo_centavos),
        atualizado_em=atualizado_em,
        valor_aplicado=_dinheiro_ou_nulo(modelo.valor_aplicado_centavos),
        rendimento=_dinheiro_ou_nulo(modelo.rendimento_centavos),
        taxa=_taxa_do_registro(modelo.dados),
        conta_remunerada_id=modelo.conta_remunerada_id,
        **_campos_do_registro(modelo.dados),
    )


def _campos_do_registro(dados: str) -> dict[str, Any]:
    """Emissor, vencimento, código e situação do registro guardado da Pluggy; o que falta ou
    não faz sentido fica nulo."""
    try:
        registro = json.loads(dados)
    except ValueError:
        return {}
    if not isinstance(registro, dict):
        return {}

    def texto(campo: str) -> str | None:
        valor = registro.get(campo)
        return valor.strip()[:100] or None if isinstance(valor, str) else None

    vencimento = None
    bruto = registro.get("dueDate")
    if isinstance(bruto, str):
        try:
            vencimento = date.fromisoformat(bruto[:10])
        except ValueError:
            vencimento = None
    return {
        "emissor": texto("issuer"),
        "vencimento": vencimento,
        "codigo": texto("code"),
        "situacao": texto("status"),
    }


def _taxa_do_registro(dados: str) -> TaxaDoInvestimento | None:
    """A taxa do registro guardado da Pluggy (`rate`, `rateType`, `fixedAnnualRate`)."""
    try:
        registro = json.loads(dados)
    except ValueError:
        return None
    if not isinstance(registro, dict):
        return None
    return taxa_do_registro(
        registro.get("rate"), registro.get("rateType"), registro.get("fixedAnnualRate")
    )


def _dinheiro_ou_nulo(centavos: int | None) -> Dinheiro | None:
    return None if centavos is None else Dinheiro(centavos)


class RepositorioDeCoberturasSqlAlchemy:
    def listar_por_resgates(
        self, usuario_id: UUID, movimento_ids: list[UUID]
    ) -> list[CoberturaDeCompra]:
        modelos = self._sessao.scalars(
            select(CoberturaDeCompraModelo)
            .join(GastoModelo, CoberturaDeCompraModelo.gasto_id == GastoModelo.id)
            .join(ContaModelo, GastoModelo.conta_id == ContaModelo.id)
            .where(
                ContaModelo.usuario_id == usuario_id,
                CoberturaDeCompraModelo.movimento_id.in_(movimento_ids),
            )
            .order_by(CoberturaDeCompraModelo.id)
        )
        return [self._de_modelo(m) for m in modelos]

    def __init__(self, sessao: Session) -> None:
        self._sessao = sessao

    def adicionar(self, cobertura: CoberturaDeCompra) -> None:
        self._sessao.add(
            CoberturaDeCompraModelo(
                id=cobertura.id,
                gasto_id=cobertura.gasto_id,
                destinacao_id=_destinacao_id(
                    self._sessao,
                    _dono_da_conta(
                        self._sessao, self._sessao.get(GastoModelo, cobertura.gasto_id).conta_id
                    ),
                    cobertura.tag,
                ),
                valor_centavos=cobertura.valor.centavos,
                movimento_id=cobertura.movimento_id,
                principal_centavos=(
                    None if cobertura.principal is None else cobertura.principal.centavos
                ),
            )
        )
        self._sessao.flush()

    def obter(self, usuario_id: UUID, id: UUID) -> CoberturaDeCompra | None:
        m = self._sessao.scalar(
            select(CoberturaDeCompraModelo)
            .join(GastoModelo, CoberturaDeCompraModelo.gasto_id == GastoModelo.id)
            .join(ContaModelo, GastoModelo.conta_id == ContaModelo.id)
            .where(ContaModelo.usuario_id == usuario_id, CoberturaDeCompraModelo.id == id)
        )
        return self._de_modelo(m) if m else None

    @staticmethod
    def _de_modelo(m: CoberturaDeCompraModelo) -> CoberturaDeCompra:
        return CoberturaDeCompra(
            m.gasto_id,
            Tag(m.tag),
            Dinheiro(m.valor_centavos),
            m.id,
            m.movimento_id,
            _dinheiro_ou_nulo(m.principal_centavos),
        )

    def remover(self, id: UUID) -> None:
        self._sessao.execute(
            delete(CoberturaDeCompraModelo).where(CoberturaDeCompraModelo.id == id)
        )

    def remover_dos_gastos(self, gasto_ids: list[UUID]) -> None:
        self._sessao.execute(
            delete(CoberturaDeCompraModelo).where(CoberturaDeCompraModelo.gasto_id.in_(gasto_ids))
        )

    def listar_dos_gastos(self, gasto_ids: list[UUID]) -> dict[UUID, list[CoberturaDeCompra]]:
        por_gasto: dict[UUID, list[CoberturaDeCompra]] = {}
        for m in self._sessao.scalars(
            select(CoberturaDeCompraModelo)
            .where(CoberturaDeCompraModelo.gasto_id.in_(gasto_ids))
            .order_by(CoberturaDeCompraModelo.tag)
        ):
            por_gasto.setdefault(m.gasto_id, []).append(self._de_modelo(m))
        return por_gasto

    def somar_do_gasto(self, gasto_id: UUID) -> Dinheiro:
        return Dinheiro(
            sum(c.valor.centavos for c in self.listar_dos_gastos([gasto_id]).get(gasto_id, []))
        )

    def tags_do_gasto(self, gasto_id: UUID) -> frozenset[Tag]:
        return frozenset(c.tag for c in self.listar_dos_gastos([gasto_id]).get(gasto_id, []))

    def somar_coberto_por_tag(
        self, usuario_id: UUID, categoria: CategoriaDoGasto
    ) -> dict[Tag, Dinheiro]:
        consulta = (
            select(
                CoberturaDeCompraModelo.tag,
                func.sum(
                    func.coalesce(
                        CoberturaDeCompraModelo.principal_centavos,
                        CoberturaDeCompraModelo.valor_centavos,
                    )
                ),
            )
            .join(GastoModelo, CoberturaDeCompraModelo.gasto_id == GastoModelo.id)
            .join(ContaModelo, GastoModelo.conta_id == ContaModelo.id)
            .where(ContaModelo.usuario_id == usuario_id, GastoModelo.categoria == categoria.value)
            .group_by(CoberturaDeCompraModelo.tag)
        )
        return {Tag(t): Dinheiro(int(v)) for t, v in self._sessao.execute(consulta)}

    def usado_do_resgate(self, movimento_id: UUID, tag: Tag) -> Dinheiro:
        total = self._sessao.scalar(
            select(func.coalesce(func.sum(CoberturaDeCompraModelo.valor_centavos), 0)).where(
                CoberturaDeCompraModelo.movimento_id == movimento_id,
                CoberturaDeCompraModelo.tag == str(tag),
            )
        )
        return Dinheiro(int(total or 0))

    def usado_dos_resgates(self, movimento_ids: Sequence[UUID]) -> dict[UUID, dict[Tag, Dinheiro]]:
        resultado: dict[UUID, dict[Tag, Dinheiro]] = {}
        if not movimento_ids:
            return resultado
        consulta = (
            select(
                CoberturaDeCompraModelo.movimento_id,
                CoberturaDeCompraModelo.tag,
                func.sum(CoberturaDeCompraModelo.valor_centavos),
            )
            .where(CoberturaDeCompraModelo.movimento_id.in_(movimento_ids))
            .group_by(CoberturaDeCompraModelo.movimento_id, CoberturaDeCompraModelo.tag)
        )
        for movimento_id, tag, valor in self._sessao.execute(consulta):
            resultado.setdefault(movimento_id, {})[Tag(tag)] = Dinheiro(int(valor))
        return resultado

    def resgate_em_uso(self, movimento_ids: Sequence[UUID]) -> bool:
        if not movimento_ids:
            return False
        return (
            self._sessao.scalar(
                select(CoberturaDeCompraModelo.id)
                .where(CoberturaDeCompraModelo.movimento_id.in_(movimento_ids))
                .limit(1)
            )
            is not None
        )

    def somar_adicional_por_categoria(
        self, usuario_id: UUID, inicio: date, fim: date
    ) -> dict[CategoriaDoGasto, dict[Tag, Dinheiro]]:
        consulta = (
            select(
                GastoModelo.categoria,
                CoberturaDeCompraModelo.tag,
                func.sum(CoberturaDeCompraModelo.valor_centavos),
            )
            .join(GastoModelo, CoberturaDeCompraModelo.gasto_id == GastoModelo.id)
            .join(ContaModelo, GastoModelo.conta_id == ContaModelo.id)
            .where(
                ContaModelo.usuario_id == usuario_id,
                GastoModelo.data >= inicio,
                GastoModelo.data <= fim,
                # Só a compra paga com um resgate real aumenta o limite; a cobertura só de
                # métrica (reserva de aporte com categoria) segue apenas descontando o gasto.
                CoberturaDeCompraModelo.movimento_id.is_not(None),
            )
            .group_by(GastoModelo.categoria, CoberturaDeCompraModelo.tag)
        )
        por_categoria: dict[CategoriaDoGasto, dict[Tag, Dinheiro]] = {}
        for categoria, tag, valor in self._sessao.execute(consulta):
            por_categoria.setdefault(CategoriaDoGasto(categoria), {})[Tag(tag)] = Dinheiro(
                int(valor)
            )
        return por_categoria


class RepositorioDeCoresDasDestinacoesSqlAlchemy:
    def __init__(self, sessao: Session) -> None:
        self._sessao = sessao

    def definir(self, usuario_id: UUID, tag: Tag, cor: CorDaDestinacao) -> None:
        from sqlalchemy.dialects.sqlite import insert

        self._sessao.execute(
            insert(CorDaDestinacaoModelo)
            .values(
                id=uuid4(),
                destinacao_id=_destinacao_id(self._sessao, usuario_id, tag),
                cor=cor.value,
            )
            .on_conflict_do_update(index_elements=["destinacao_id"], set_={"cor": cor.value})
        )

    def remover(self, usuario_id: UUID, tag: Tag) -> None:
        self._sessao.execute(
            delete(CorDaDestinacaoModelo).where(
                CorDaDestinacaoModelo.usuario_id == usuario_id,
                CorDaDestinacaoModelo.tag == str(tag),
            )
        )

    def listar(self, usuario_id: UUID) -> dict[Tag, CorDaDestinacao]:
        return {
            Tag(m.tag): CorDaDestinacao(m.cor)
            for m in self._sessao.scalars(
                select(CorDaDestinacaoModelo).where(CorDaDestinacaoModelo.usuario_id == usuario_id)
            )
        }


_OPERACOES_FORA_DA_FATURA = ("PAGAMENTO_FATURA", "TRANSFERENCIA_MESMA_INSTITUICAO")


def _compra_do_cartao(m: TransacaoImportadaModelo) -> CompraDoCartao:
    return CompraDoCartao(
        id=m.id,
        data=m.data,
        valor=Dinheiro(m.valor_centavos),
        sentido=SentidoDaTransacao(m.sentido),
        id_da_fatura=m.id_externo_da_fatura,
        descricao=m.descricao,
        parcela_numero=m.parcela_numero,
        parcela_total=m.parcela_total,
        estado=EstadoDaTransacaoImportada(m.estado),
    )


class RepositorioDeFaturasSqlAlchemy:
    """Satisfaz a porta RepositorioDeFaturas; só enxerga faturas de contas do usuário."""

    def __init__(self, sessao: Session) -> None:
        self._sessao = sessao

    def salvar(self, conta_id: UUID, fatura: Fatura) -> None:
        modelo = self._sessao.scalar(
            select(FaturaModelo).where(
                FaturaModelo.conta_id == conta_id, FaturaModelo.fechamento == fatura.fechamento
            )
        )
        if modelo is None:
            modelo = FaturaModelo(id=fatura.id, conta_id=conta_id, fechamento=fatura.fechamento)
            self._sessao.add(modelo)
        modelo.id_externo = fatura.id_externo
        modelo.inicio = fatura.inicio
        modelo.vencimento = fatura.vencimento
        modelo.total_centavos = fatura.total.centavos
        modelo.minimo_centavos = fatura.minimo.centavos if fatura.minimo else None
        modelo.fonte = fatura.fonte.value
        self._sessao.flush()
        self._sessao.execute(
            delete(PagamentoDeFaturaModelo).where(PagamentoDeFaturaModelo.fatura_id == modelo.id)
        )
        vistos: set[tuple[date, int]] = set()
        for pagamento in fatura.pagamentos:
            chave = (pagamento.data, pagamento.valor.centavos)
            if chave in vistos:
                continue
            vistos.add(chave)
            self._sessao.add(
                PagamentoDeFaturaModelo(
                    id=uuid4(),
                    fatura_id=modelo.id,
                    data=pagamento.data,
                    valor_centavos=pagamento.valor.centavos,
                    forma=pagamento.forma,
                )
            )
        self._sessao.flush()

    def listar(self, usuario_id: UUID, conta_id: UUID | None = None) -> list[Fatura]:
        consulta = (
            select(FaturaModelo)
            .join(ContaModelo, FaturaModelo.conta_id == ContaModelo.id)
            .where(ContaModelo.usuario_id == usuario_id)
            .order_by(FaturaModelo.fechamento.desc(), FaturaModelo.id)
        )
        if conta_id is not None:
            consulta = consulta.where(FaturaModelo.conta_id == conta_id)
        return [self._de_modelo(m) for m in self._sessao.scalars(consulta)]

    def obter(self, usuario_id: UUID, id: UUID) -> Fatura | None:
        modelo = self._sessao.scalar(
            select(FaturaModelo)
            .join(ContaModelo, FaturaModelo.conta_id == ContaModelo.id)
            .where(ContaModelo.usuario_id == usuario_id, FaturaModelo.id == id)
        )
        return self._de_modelo(modelo) if modelo else None

    def compras_da_fatura(self, usuario_id: UUID, fatura_id: UUID) -> list[CompraDoCartao]:
        consulta = (
            select(TransacaoImportadaModelo)
            .join(ContaModelo, TransacaoImportadaModelo.conta_id == ContaModelo.id)
            .where(
                ContaModelo.usuario_id == usuario_id,
                TransacaoImportadaModelo.fatura_id == fatura_id,
            )
            .order_by(TransacaoImportadaModelo.data, TransacaoImportadaModelo.id)
        )
        return [_compra_do_cartao(m) for m in self._sessao.scalars(consulta)]

    def compras_da_conta(self, conta_id: UUID) -> list[CompraDoCartao]:
        consulta = (
            select(TransacaoImportadaModelo)
            .where(
                TransacaoImportadaModelo.conta_id == conta_id,
                or_(
                    TransacaoImportadaModelo.tipo_de_operacao.is_(None),
                    TransacaoImportadaModelo.tipo_de_operacao.not_in(_OPERACOES_FORA_DA_FATURA),
                ),
            )
            .order_by(TransacaoImportadaModelo.data, TransacaoImportadaModelo.id)
        )
        return [_compra_do_cartao(m) for m in self._sessao.scalars(consulta)]

    def pagamentos_da_conta(self, conta_id: UUID) -> list[PagamentoDeFatura]:
        consulta = (
            select(TransacaoImportadaModelo)
            .where(
                TransacaoImportadaModelo.conta_id == conta_id,
                TransacaoImportadaModelo.tipo_de_operacao == "PAGAMENTO_FATURA",
            )
            .order_by(TransacaoImportadaModelo.data, TransacaoImportadaModelo.id)
        )
        return [
            PagamentoDeFatura(m.data, Dinheiro(m.valor_centavos), None)
            for m in self._sessao.scalars(consulta)
        ]

    def vincular_compra(self, compra_id: UUID, fatura_id: UUID | None) -> None:
        self._sessao.execute(
            update(TransacaoImportadaModelo)
            .where(TransacaoImportadaModelo.id == compra_id)
            .values(fatura_id=fatura_id)
        )
        self._sessao.flush()

    def _de_modelo(self, m: FaturaModelo) -> Fatura:
        pagamentos = self._sessao.scalars(
            select(PagamentoDeFaturaModelo)
            .where(PagamentoDeFaturaModelo.fatura_id == m.id)
            .order_by(PagamentoDeFaturaModelo.data, PagamentoDeFaturaModelo.valor_centavos)
        )
        return Fatura(
            id=m.id,
            conta_id=m.conta_id,
            id_externo=m.id_externo,
            inicio=m.inicio,
            fechamento=m.fechamento,
            vencimento=m.vencimento,
            total=Dinheiro(m.total_centavos),
            minimo=Dinheiro(m.minimo_centavos) if m.minimo_centavos is not None else None,
            pagamentos=tuple(
                PagamentoDeFatura(p.data, Dinheiro(p.valor_centavos), p.forma) for p in pagamentos
            ),
            fonte=FonteDaFatura(m.fonte),
        )


def _reaplicacoes_do_usuario(usuario_id: UUID):
    return (
        select(ReaplicacaoDeResgateModelo)
        .join(
            MovimentoDeInvestimentoModelo,
            ReaplicacaoDeResgateModelo.aporte_id == MovimentoDeInvestimentoModelo.id,
        )
        .join(ContaModelo, MovimentoDeInvestimentoModelo.conta_id == ContaModelo.id)
        .where(ContaModelo.usuario_id == usuario_id)
    )


def _reaplicacao_de(modelo):
    return ReaplicacaoDeResgate(
        modelo.resgate_id, modelo.aporte_id, Dinheiro(modelo.valor_centavos), modelo.id
    )


class RepositorioDeReaplicacoesDeResgatesSqlAlchemy:
    def __init__(self, sessao: Session) -> None:
        self._sessao = sessao

    def bloquear(self, usuario_id: UUID) -> None:
        meus = (
            select(MovimentoDeInvestimentoModelo.id)
            .join(ContaModelo, MovimentoDeInvestimentoModelo.conta_id == ContaModelo.id)
            .where(ContaModelo.usuario_id == usuario_id)
        )
        self._sessao.execute(
            update(ReaplicacaoDeResgateModelo)
            .where(ReaplicacaoDeResgateModelo.aporte_id.in_(meus))
            .values(valor_centavos=ReaplicacaoDeResgateModelo.valor_centavos)
        )

    def listar(self, usuario_id: UUID) -> list[ReaplicacaoDeResgate]:
        return [
            _reaplicacao_de(m)
            for m in self._sessao.scalars(
                _reaplicacoes_do_usuario(usuario_id).order_by(
                    MovimentoDeInvestimentoModelo.data.desc(), ReaplicacaoDeResgateModelo.id
                )
            )
        ]

    def obter(self, usuario_id: UUID, id: UUID) -> ReaplicacaoDeResgate | None:
        m = self._sessao.scalar(
            _reaplicacoes_do_usuario(usuario_id).where(ReaplicacaoDeResgateModelo.id == id)
        )
        return _reaplicacao_de(m) if m else None

    def para_movimento(self, usuario_id: UUID, movimento_id: UUID) -> ReaplicacaoDeResgate | None:
        m = self._sessao.scalar(
            _reaplicacoes_do_usuario(usuario_id).where(
                or_(
                    ReaplicacaoDeResgateModelo.aporte_id == movimento_id,
                    ReaplicacaoDeResgateModelo.resgate_id == movimento_id,
                )
            )
        )
        return _reaplicacao_de(m) if m else None

    def adicionar(self, reaplicacao: ReaplicacaoDeResgate) -> None:
        gravado = self._sessao.scalar(
            sqlite.insert(ReaplicacaoDeResgateModelo)
            .values(
                id=reaplicacao.id,
                resgate_id=reaplicacao.resgate_id,
                aporte_id=reaplicacao.aporte_id,
                valor_centavos=reaplicacao.valor.centavos,
            )
            .on_conflict_do_nothing()
            .returning(ReaplicacaoDeResgateModelo.id)
        )
        if gravado is None:
            raise ReaplicacaoJaExiste(
                "Um destes movimentos já tem reaplicação. Desfaça o vínculo antes de alterar."
            )

    def remover(self, id: UUID) -> None:
        self._sessao.execute(
            delete(ReaplicacaoDeResgateModelo).where(ReaplicacaoDeResgateModelo.id == id)
        )

    def somar_no_periodo(self, usuario_id: UUID, inicio: date, fim: date) -> Dinheiro:
        consulta = (
            _reaplicacoes_do_usuario(usuario_id)
            .with_only_columns(
                func.coalesce(func.sum(ReaplicacaoDeResgateModelo.valor_centavos), 0)
            )
            .join(
                InvestimentoModelo,
                MovimentoDeInvestimentoModelo.investimento_id == InvestimentoModelo.id,
            )
            .where(
                MovimentoDeInvestimentoModelo.data >= inicio,
                MovimentoDeInvestimentoModelo.data <= fim,
                MovimentoDeInvestimentoModelo.tipo == TipoDeMovimento.APORTE.value,
                MovimentoDeInvestimentoModelo.origem != OrigemDoMovimento.SALDO_INICIAL.value,
                InvestimentoModelo.tipo != "CAIXINHA",
            )
        )
        return Dinheiro(int(self._sessao.scalar(consulta) or 0))
