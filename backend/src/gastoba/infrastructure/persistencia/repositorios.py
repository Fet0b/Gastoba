"""Repositórios SQLAlchemy: implementam as portas do domain convertendo ORM ↔ entidades.

As consultas por tag usam ``json_each``, específico do SQLite; trocar de banco exige
reescrever só ``RepositorioDeGastosSqlAlchemy.listar`` e ``listar_tags``.
"""

from datetime import date, datetime
from uuid import UUID

from sqlalchemy import delete, exists, func, or_, select, true, update
from sqlalchemy.dialects import sqlite
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.chave_de_api import ChaveDeApi, EscopoDaChave
from gastoba.domain.conta import Conta, OrigemDaConta, TipoDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.email import Email
from gastoba.domain.excecoes import (
    ContaJaExiste,
    ContaNaoEncontrada,
    EmailJaCadastrado,
    GanhoNaoEncontrado,
    MetaNaoEncontrada,
)
from gastoba.domain.ganho import Ganho, OrigemDoGanho
from gastoba.domain.gasto import Gasto, OrigemDoGasto
from gastoba.domain.meta import Meta
from gastoba.domain.recorrencia import Recorrencia, TipoDeRecorrencia
from gastoba.domain.senha import SenhaComHash
from gastoba.domain.sessao import Sessao
from gastoba.domain.tag import Tag
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.persistencia.modelos import (
    ChaveDeApiModelo,
    ContaModelo,
    GanhoModelo,
    GastoModelo,
    MetaModelo,
    RecorrenciaModelo,
    SessaoModelo,
    TransacaoImportadaModelo,
    UsuarioModelo,
)

_VIOLACAO_DO_NOME_UNICO = "UNIQUE constraint failed: contas.usuario_id, contas.nome"
_VIOLACAO_DO_EMAIL_UNICO = "UNIQUE constraint failed: usuarios.email"
# Sem o e-mail na mensagem: ele não deve acabar em logs nem em respostas de erro.
_MENSAGEM_DE_EMAIL_JA_CADASTRADO = "Já existe um usuário com este e-mail."


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
    """Satisfaz a porta RepositorioDeContas por tipagem estrutural."""

    def __init__(self, sessao: Session) -> None:
        self._sessao = sessao

    def adicionar(self, conta: Conta) -> None:
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
                tags=[t.valor for t in gasto.tags],
                categoria=gasto.categoria.value,
                origem=gasto.origem.value,
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
            # EXISTS (SELECT * FROM json_each(gastos.tags) WHERE value = ?), correlacionado.
            json_each = func.json_each(GastoModelo.tags).table_valued("value")
            consulta = consulta.where(exists().where(json_each.c.value == tag.valor))
        if categoria is not None:
            consulta = consulta.where(GastoModelo.categoria == categoria.value)
        return [_gasto_de(m) for m in self._sessao.scalars(consulta)]

    def somar_por_categoria(
        self, usuario_id: UUID, inicio: date, fim: date
    ) -> dict[CategoriaDoGasto, Dinheiro]:
        consulta = (
            select(GastoModelo.categoria, func.sum(GastoModelo.valor_centavos))
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
        json_each = func.json_each(GastoModelo.tags).table_valued("value")
        consulta = (
            select(json_each.c.value)
            .distinct()
            .select_from(GastoModelo)
            .join(ContaModelo, GastoModelo.conta_id == ContaModelo.id)
            # join com true() em vez da vírgula, que geraria aviso de produto cartesiano.
            .join(json_each, true())
            .where(ContaModelo.usuario_id == usuario_id)
            .order_by(json_each.c.value)
        )
        return [Tag(valor) for valor in self._sessao.scalars(consulta)]


class RepositorioDeTransacoesImportadasSqlAlchemy:
    """Satisfaz a porta RepositorioDeTransacoesImportadas; só enxerga contas do usuário."""

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
                data=transacao.data,
                descricao=transacao.descricao,
                valor_centavos=transacao.valor.centavos,
                sentido=transacao.sentido.value,
                tipo_de_operacao=transacao.tipo_de_operacao,
                estado=transacao.estado.value,
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
            .values(estado=transacao.estado.value)
        )

    def data_mais_recente(self, conta_id: UUID) -> date | None:
        return self._sessao.scalar(
            select(func.max(TransacaoImportadaModelo.data)).where(
                TransacaoImportadaModelo.conta_id == conta_id
            )
        )


class RepositorioDeGanhosSqlAlchemy:
    """Satisfaz a porta RepositorioDeGanhos; só enxerga ganhos das contas do usuário."""

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
                tags=[t.valor for t in ganho.tags],
                origem=ganho.origem.value,
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
    """Satisfaz a porta RepositorioDeRecorrencias; filtra sempre pelo usuário dono."""

    def __init__(self, sessao: Session) -> None:
        self._sessao = sessao

    def adicionar(self, recorrencia: Recorrencia) -> None:
        self._sessao.add(
            RecorrenciaModelo(
                id=recorrencia.id,
                usuario_id=recorrencia.usuario_id,
                tipo=recorrencia.tipo.value,
                conta_id=recorrencia.conta_id,
                valor_centavos=recorrencia.valor.centavos,
                descricao=recorrencia.descricao,
                dia_do_mes=recorrencia.dia_do_mes,
                inicio=recorrencia.inicio,
                fim=recorrencia.fim,
                categoria=recorrencia.categoria.value if recorrencia.categoria else None,
                tags=[t.valor for t in recorrencia.tags],
                ativa=recorrencia.ativa,
            )
        )

    def obter(self, usuario_id: UUID, id: UUID) -> Recorrencia | None:
        modelo = self._sessao.scalar(
            select(RecorrenciaModelo).where(
                RecorrenciaModelo.id == id, RecorrenciaModelo.usuario_id == usuario_id
            )
        )
        return _recorrencia_de(modelo) if modelo else None

    def listar(self, usuario_id: UUID) -> list[Recorrencia]:
        consulta = (
            select(RecorrenciaModelo)
            .where(RecorrenciaModelo.usuario_id == usuario_id)
            .order_by(RecorrenciaModelo.descricao, RecorrenciaModelo.id)
        )
        return [_recorrencia_de(m) for m in self._sessao.scalars(consulta)]

    def contar_ativas(self, usuario_id: UUID) -> int:
        consulta = select(func.count()).where(
            RecorrenciaModelo.usuario_id == usuario_id, RecorrenciaModelo.ativa.is_(True)
        )
        return int(self._sessao.scalar(consulta) or 0)

    def listar_ativas(self, usuario_id: UUID | None = None) -> list[Recorrencia]:
        consulta = (
            select(RecorrenciaModelo)
            .where(RecorrenciaModelo.ativa.is_(True))
            .order_by(RecorrenciaModelo.inicio, RecorrenciaModelo.id)
        )
        if usuario_id is not None:
            consulta = consulta.where(RecorrenciaModelo.usuario_id == usuario_id)
        return [_recorrencia_de(m) for m in self._sessao.scalars(consulta)]

    def atualizar(self, recorrencia: Recorrencia) -> None:
        self._sessao.execute(
            update(RecorrenciaModelo)
            .where(
                RecorrenciaModelo.id == recorrencia.id,
                RecorrenciaModelo.usuario_id == recorrencia.usuario_id,
            )
            .values(
                valor_centavos=recorrencia.valor.centavos,
                descricao=recorrencia.descricao,
                dia_do_mes=recorrencia.dia_do_mes,
                categoria=recorrencia.categoria.value if recorrencia.categoria else None,
                tags=[t.valor for t in recorrencia.tags],
                fim=recorrencia.fim,
                ativa=recorrencia.ativa,
            )
        )


class RepositorioDeMetasSqlAlchemy:
    """Satisfaz a porta RepositorioDeMetas; filtra sempre pelo usuário dono."""

    def __init__(self, sessao: Session) -> None:
        self._sessao = sessao

    def obter(self, usuario_id: UUID, categoria: CategoriaDoGasto) -> Meta | None:
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
        ordem = {categoria.value: posicao for posicao, categoria in enumerate(CategoriaDoGasto)}
        return [
            _meta_de(m) for m in sorted(modelos, key=lambda m: ordem.get(m.categoria, len(ordem)))
        ]

    def salvar(self, meta: Meta) -> None:
        existente = self._sessao.scalar(
            select(MetaModelo).where(
                MetaModelo.usuario_id == meta.usuario_id,
                MetaModelo.categoria == meta.categoria.value,
            )
        )
        if existente is not None:
            existente.percentual = meta.percentual
            return
        self._sessao.add(
            MetaModelo(
                id=meta.id,
                usuario_id=meta.usuario_id,
                categoria=meta.categoria.value,
                percentual=meta.percentual,
            )
        )

    def remover(self, usuario_id: UUID, categoria: CategoriaDoGasto) -> None:
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
        id=modelo.id,
    )


def _recorrencia_de(modelo: RecorrenciaModelo) -> Recorrencia:
    return Recorrencia(
        usuario_id=modelo.usuario_id,
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
        categoria=CategoriaDoGasto(modelo.categoria),
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
        recorrencia_id=modelo.recorrencia_id,
        competencia=modelo.competencia,
        id=modelo.id,
    )
