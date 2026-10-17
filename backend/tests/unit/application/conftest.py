import copy
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from types import TracebackType
from typing import Self
from uuid import UUID, uuid4

import pytest

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.chave_de_api import ChaveDeApi
from gastoba.domain.conta import Conta, TipoDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.email import Email
from gastoba.domain.excecoes import (
    ContaJaExiste,
    ContaNaoEncontrada,
    EmailJaCadastrado,
    GanhoNaoEncontrado,
    MetaNaoEncontrada,
    MuitasTentativas,
)
from gastoba.domain.ganho import Ganho
from gastoba.domain.gasto import Gasto
from gastoba.domain.meta import Meta
from gastoba.domain.recorrencia import Recorrencia
from gastoba.domain.senha import SenhaComHash, SenhaEmClaro
from gastoba.domain.sessao import Sessao
from gastoba.domain.tag import Tag
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    TransacaoImportada,
)
from gastoba.domain.usuario import Usuario


@dataclass
class EstadoEmMemoria:
    """Tabelas em memória, indexadas por ``id``."""

    usuarios: dict[UUID, Usuario] = field(default_factory=dict)
    contas: dict[UUID, Conta] = field(default_factory=dict)
    gastos: dict[UUID, Gasto] = field(default_factory=dict)
    ganhos: dict[UUID, Ganho] = field(default_factory=dict)
    transacoes_importadas: dict[UUID, TransacaoImportada] = field(default_factory=dict)
    recorrencias: dict[UUID, Recorrencia] = field(default_factory=dict)
    metas: dict[UUID, Meta] = field(default_factory=dict)
    sessoes: dict[UUID, Sessao] = field(default_factory=dict)
    chaves_de_api: dict[UUID, ChaveDeApi] = field(default_factory=dict)


class RepositorioDeUsuariosEmMemoria:
    """Satisfaz a porta RepositorioDeUsuarios por tipagem estrutural."""

    def __init__(self, estado: EstadoEmMemoria) -> None:
        self._estado = estado

    def obter(self, id: UUID) -> Usuario | None:
        usuario = self._estado.usuarios.get(id)
        return copy.deepcopy(usuario)

    def garantir(self, usuario: Usuario) -> None:
        self._estado.usuarios.setdefault(usuario.id, copy.deepcopy(usuario))

    def obter_por_email(self, email: Email) -> Usuario | None:
        for usuario in self._estado.usuarios.values():
            if usuario.email == email:
                return copy.deepcopy(usuario)
        return None

    def salvar(self, usuario: Usuario) -> None:
        for existente in self._estado.usuarios.values():
            if (
                usuario.email is not None
                and existente.email == usuario.email
                and existente.id != usuario.id
            ):
                raise EmailJaCadastrado("Já existe um usuário com este e-mail.")
        self._estado.usuarios[usuario.id] = copy.deepcopy(usuario)


class RepositorioDeContasEmMemoria:
    """Satisfaz a porta RepositorioDeContas; devolve cópias, como um banco devolveria."""

    def __init__(self, estado: EstadoEmMemoria) -> None:
        self._estado = estado

    def adicionar(self, conta: Conta) -> None:
        for existente in self._estado.contas.values():
            if existente.usuario_id == conta.usuario_id and existente.nome == conta.nome:
                raise ContaJaExiste(f"Já existe uma conta com o nome {conta.nome!r}.")
        self._estado.contas[conta.id] = copy.deepcopy(conta)

    def obter(self, usuario_id: UUID, id: UUID) -> Conta | None:
        conta = self._estado.contas.get(id)
        if conta is None or conta.usuario_id != usuario_id:
            return None
        return copy.deepcopy(conta)

    def obter_por_id_externo(self, usuario_id: UUID, id_externo: str) -> Conta | None:
        for conta in self._estado.contas.values():
            if conta.usuario_id == usuario_id and conta.id_externo == id_externo:
                return copy.deepcopy(conta)
        return None

    def atualizar_do_banco(self, id: UUID, saldo: Dinheiro, tipo: TipoDaConta) -> None:
        conta = self._estado.contas.get(id)
        if conta is None:
            raise ContaNaoEncontrada("Conta não encontrada.")
        conta.saldo = saldo
        conta.tipo = tipo

    def listar(self, usuario_id: UUID) -> list[Conta]:
        contas = [c for c in self._estado.contas.values() if c.usuario_id == usuario_id]
        return [copy.deepcopy(c) for c in sorted(contas, key=lambda c: c.nome)]

    def debitar(self, id: UUID, valor: Dinheiro) -> None:
        conta = self._estado.contas.get(id)
        if conta is None:
            raise ContaNaoEncontrada("Conta não encontrada.")
        conta.saldo = conta.saldo - valor

    def creditar(self, id: UUID, valor: Dinheiro) -> None:
        conta = self._estado.contas.get(id)
        if conta is None:
            raise ContaNaoEncontrada("Conta não encontrada.")
        conta.saldo = conta.saldo + valor


class RepositorioDeGastosEmMemoria:
    """Satisfaz a porta RepositorioDeGastos; só enxerga gastos das contas do usuário."""

    def __init__(self, estado: EstadoEmMemoria) -> None:
        self._estado = estado

    def adicionar(self, gasto: Gasto) -> None:
        self._estado.gastos[gasto.id] = copy.deepcopy(gasto)

    def _gastos_do_usuario(self, usuario_id: UUID) -> list[Gasto]:
        contas_do_usuario = {
            c.id for c in self._estado.contas.values() if c.usuario_id == usuario_id
        }
        return [g for g in self._estado.gastos.values() if g.conta_id in contas_do_usuario]

    def listar(
        self,
        usuario_id: UUID,
        inicio: date,
        fim: date,
        conta_id: UUID | None = None,
        tag: Tag | None = None,
        categoria: CategoriaDoGasto | None = None,
    ) -> list[Gasto]:
        gastos = [
            g
            for g in self._gastos_do_usuario(usuario_id)
            if inicio <= g.data <= fim
            and (conta_id is None or g.conta_id == conta_id)
            and (tag is None or tag in g.tags)
            and (categoria is None or g.categoria == categoria)
        ]
        # Ordena por id e depois por data decrescente; a ordenação estável mantém o id no empate.
        gastos.sort(key=lambda g: g.id)
        gastos.sort(key=lambda g: g.data, reverse=True)
        return [copy.deepcopy(g) for g in gastos]

    def somar_por_categoria(
        self, usuario_id: UUID, inicio: date, fim: date
    ) -> dict[CategoriaDoGasto, Dinheiro]:
        totais: dict[CategoriaDoGasto, Dinheiro] = {}
        for gasto in self._gastos_do_usuario(usuario_id):
            if inicio <= gasto.data <= fim:
                totais[gasto.categoria] = totais.get(gasto.categoria, Dinheiro(0)) + gasto.valor
        return totais

    def competencias_geradas(self, recorrencia_id: UUID) -> set[str]:
        return {
            g.competencia
            for g in self._estado.gastos.values()
            if g.recorrencia_id == recorrencia_id and g.competencia
        }

    def listar_tags(self, usuario_id: UUID) -> list[Tag]:
        tags = {tag for g in self._gastos_do_usuario(usuario_id) for tag in g.tags}
        return sorted(tags, key=lambda t: t.valor)


class RepositorioDeGanhosEmMemoria:
    """Satisfaz a porta RepositorioDeGanhos; só enxerga ganhos das contas do usuário."""

    def __init__(self, estado: EstadoEmMemoria) -> None:
        self._estado = estado

    def adicionar(self, ganho: Ganho) -> None:
        self._estado.ganhos[ganho.id] = copy.deepcopy(ganho)

    def obter(self, usuario_id: UUID, id: UUID) -> Ganho | None:
        ganho = self._estado.ganhos.get(id)
        if ganho is None:
            return None
        conta = self._estado.contas.get(ganho.conta_id)
        if conta is None or conta.usuario_id != usuario_id:
            return None
        return copy.deepcopy(ganho)

    def remover(self, id: UUID) -> None:
        if self._estado.ganhos.pop(id, None) is None:
            raise GanhoNaoEncontrado("Ganho não encontrado.")

    def listar(
        self,
        usuario_id: UUID,
        inicio: date,
        fim: date,
        conta_id: UUID | None = None,
    ) -> list[Ganho]:
        contas_do_usuario = {
            c.id for c in self._estado.contas.values() if c.usuario_id == usuario_id
        }
        ganhos = [
            g
            for g in self._estado.ganhos.values()
            if g.conta_id in contas_do_usuario
            and inicio <= g.data <= fim
            and (conta_id is None or g.conta_id == conta_id)
        ]
        ganhos.sort(key=lambda g: g.id)
        ganhos.sort(key=lambda g: g.data, reverse=True)
        return [copy.deepcopy(g) for g in ganhos]

    def somar(self, usuario_id: UUID, inicio: date, fim: date) -> Dinheiro:
        total = Dinheiro(0)
        for ganho in self.listar(usuario_id, inicio, fim):
            total = total + ganho.valor
        return total

    def competencias_geradas(self, recorrencia_id: UUID) -> set[str]:
        return {
            g.competencia
            for g in self._estado.ganhos.values()
            if g.recorrencia_id == recorrencia_id and g.competencia
        }


class RepositorioDeTransacoesImportadasEmMemoria:
    """Satisfaz a porta RepositorioDeTransacoesImportadas; só enxerga contas do usuário."""

    def __init__(self, estado: EstadoEmMemoria) -> None:
        self._estado = estado

    def adicionar_se_nova(self, transacao: TransacaoImportada) -> bool:
        for existente in self._estado.transacoes_importadas.values():
            if (
                existente.conta_id == transacao.conta_id
                and existente.id_externo == transacao.id_externo
            ):
                return False
        self._estado.transacoes_importadas[transacao.id] = copy.deepcopy(transacao)
        return True

    def _do_usuario(self, usuario_id: UUID) -> list[TransacaoImportada]:
        contas = {c.id for c in self._estado.contas.values() if c.usuario_id == usuario_id}
        return [t for t in self._estado.transacoes_importadas.values() if t.conta_id in contas]

    def obter(self, usuario_id: UUID, id: UUID) -> TransacaoImportada | None:
        for transacao in self._do_usuario(usuario_id):
            if transacao.id == id:
                return copy.deepcopy(transacao)
        return None

    def listar(
        self, usuario_id: UUID, estado: EstadoDaTransacaoImportada
    ) -> list[TransacaoImportada]:
        transacoes = [t for t in self._do_usuario(usuario_id) if t.estado == estado]
        transacoes.sort(key=lambda t: t.id)
        transacoes.sort(key=lambda t: t.data, reverse=True)
        return [copy.deepcopy(t) for t in transacoes]

    def atualizar_estado(self, transacao: TransacaoImportada) -> None:
        self._estado.transacoes_importadas[transacao.id].estado = transacao.estado

    def data_mais_recente(self, conta_id: UUID) -> date | None:
        datas = [
            t.data for t in self._estado.transacoes_importadas.values() if t.conta_id == conta_id
        ]
        return max(datas, default=None)


class RepositorioDeRecorrenciasEmMemoria:
    """Satisfaz a porta RepositorioDeRecorrencias; devolve cópias, como um banco devolveria."""

    def __init__(self, estado: EstadoEmMemoria) -> None:
        self._estado = estado

    def adicionar(self, recorrencia: Recorrencia) -> None:
        self._estado.recorrencias[recorrencia.id] = copy.deepcopy(recorrencia)

    def obter(self, usuario_id: UUID, id: UUID) -> Recorrencia | None:
        recorrencia = self._estado.recorrencias.get(id)
        if recorrencia is None or recorrencia.usuario_id != usuario_id:
            return None
        return copy.deepcopy(recorrencia)

    def listar(self, usuario_id: UUID) -> list[Recorrencia]:
        itens = [r for r in self._estado.recorrencias.values() if r.usuario_id == usuario_id]
        itens.sort(key=lambda r: (r.descricao, r.id))
        return [copy.deepcopy(r) for r in itens]

    def contar_ativas(self, usuario_id: UUID) -> int:
        return sum(
            1 for r in self._estado.recorrencias.values() if r.usuario_id == usuario_id and r.ativa
        )

    def listar_ativas(self, usuario_id: UUID | None = None) -> list[Recorrencia]:
        itens = [
            r
            for r in self._estado.recorrencias.values()
            if r.ativa and (usuario_id is None or r.usuario_id == usuario_id)
        ]
        itens.sort(key=lambda r: (r.inicio, r.id))
        return [copy.deepcopy(r) for r in itens]

    def atualizar(self, recorrencia: Recorrencia) -> None:
        existente = self._estado.recorrencias[recorrencia.id]
        existente.valor = recorrencia.valor
        existente.descricao = recorrencia.descricao
        existente.dia_do_mes = recorrencia.dia_do_mes
        existente.categoria = recorrencia.categoria
        existente.tags = recorrencia.tags
        existente.fim = recorrencia.fim
        existente.ativa = recorrencia.ativa


class RepositorioDeMetasEmMemoria:
    """Satisfaz a porta RepositorioDeMetas; devolve cópias, na ordem do enum."""

    def __init__(self, estado: EstadoEmMemoria) -> None:
        self._estado = estado

    def obter(self, usuario_id: UUID, categoria: CategoriaDoGasto) -> Meta | None:
        for meta in self._estado.metas.values():
            if meta.usuario_id == usuario_id and meta.categoria == categoria:
                return copy.deepcopy(meta)
        return None

    def listar(self, usuario_id: UUID) -> list[Meta]:
        ordem = {categoria: posicao for posicao, categoria in enumerate(CategoriaDoGasto)}
        metas = [m for m in self._estado.metas.values() if m.usuario_id == usuario_id]
        metas.sort(key=lambda m: ordem[m.categoria])
        return [copy.deepcopy(m) for m in metas]

    def salvar(self, meta: Meta) -> None:
        for existente in self._estado.metas.values():
            if existente.usuario_id == meta.usuario_id and existente.categoria == meta.categoria:
                existente.percentual = meta.percentual
                return
        self._estado.metas[meta.id] = copy.deepcopy(meta)

    def remover(self, usuario_id: UUID, categoria: CategoriaDoGasto) -> None:
        for id, meta in list(self._estado.metas.items()):
            if meta.usuario_id == usuario_id and meta.categoria == categoria:
                del self._estado.metas[id]
                return
        raise MetaNaoEncontrada("Meta não encontrada.")


class RepositorioDeSessoesEmMemoria:
    """Satisfaz a porta RepositorioDeSessoes."""

    def __init__(self, estado: EstadoEmMemoria) -> None:
        self._estado = estado

    def adicionar(self, sessao: Sessao) -> None:
        self._estado.sessoes[sessao.id] = copy.deepcopy(sessao)

    def obter_por_hash(self, hash_do_segredo: str) -> Sessao | None:
        for sessao in self._estado.sessoes.values():
            if sessao.hash_do_segredo == hash_do_segredo:
                return copy.deepcopy(sessao)
        return None

    def revogar(self, id: UUID) -> None:
        self._estado.sessoes[id].revogar()


class RepositorioDeChavesDeApiEmMemoria:
    """Satisfaz a porta RepositorioDeChavesDeApi."""

    def __init__(self, estado: EstadoEmMemoria) -> None:
        self._estado = estado

    def adicionar(self, chave: ChaveDeApi) -> None:
        self._estado.chaves_de_api[chave.id] = copy.deepcopy(chave)

    def obter(self, usuario_id: UUID, id: UUID) -> ChaveDeApi | None:
        chave = self._estado.chaves_de_api.get(id)
        if chave is None or chave.usuario_id != usuario_id:
            return None
        return copy.deepcopy(chave)

    def obter_por_hash(self, hash_do_segredo: str) -> ChaveDeApi | None:
        for chave in self._estado.chaves_de_api.values():
            if chave.hash_do_segredo == hash_do_segredo:
                return copy.deepcopy(chave)
        return None

    def listar(self, usuario_id: UUID) -> list[ChaveDeApi]:
        chaves = [
            c
            for c in self._estado.chaves_de_api.values()
            if c.usuario_id == usuario_id and not c.revogada
        ]
        chaves.sort(key=lambda c: c.id)
        chaves.sort(key=lambda c: c.criada_em, reverse=True)
        return [copy.deepcopy(c) for c in chaves]

    def revogar(self, id: UUID) -> None:
        self._estado.chaves_de_api[id].revogar()

    def registrar_uso(self, id: UUID, quando: datetime) -> None:
        self._estado.chaves_de_api[id].ultimo_uso = quando


class UnidadeDeTrabalhoEmMemoria:
    """Satisfaz a porta UnidadeDeTrabalho; descarta no ``__exit__`` o que não foi confirmado."""

    usuarios: RepositorioDeUsuariosEmMemoria
    contas: RepositorioDeContasEmMemoria
    gastos: RepositorioDeGastosEmMemoria
    ganhos: RepositorioDeGanhosEmMemoria
    transacoes_importadas: RepositorioDeTransacoesImportadasEmMemoria
    recorrencias: RepositorioDeRecorrenciasEmMemoria
    metas: RepositorioDeMetasEmMemoria
    sessoes: RepositorioDeSessoesEmMemoria
    chaves_de_api: RepositorioDeChavesDeApiEmMemoria

    def __init__(self) -> None:
        self.confirmado = EstadoEmMemoria()
        self.commits = 0
        self._trabalho: EstadoEmMemoria | None = None

    def __enter__(self) -> Self:
        self._trabalho = copy.deepcopy(self.confirmado)
        self.usuarios = RepositorioDeUsuariosEmMemoria(self._trabalho)
        self.contas = RepositorioDeContasEmMemoria(self._trabalho)
        self.gastos = RepositorioDeGastosEmMemoria(self._trabalho)
        self.ganhos = RepositorioDeGanhosEmMemoria(self._trabalho)
        self.transacoes_importadas = RepositorioDeTransacoesImportadasEmMemoria(self._trabalho)
        self.recorrencias = RepositorioDeRecorrenciasEmMemoria(self._trabalho)
        self.metas = RepositorioDeMetasEmMemoria(self._trabalho)
        self.sessoes = RepositorioDeSessoesEmMemoria(self._trabalho)
        self.chaves_de_api = RepositorioDeChavesDeApiEmMemoria(self._trabalho)
        return self

    def __exit__(
        self,
        tipo: type[BaseException] | None,
        valor: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self._trabalho = None

    def commit(self) -> None:
        assert self._trabalho is not None, "commit fora de um bloco with"
        self.confirmado = copy.deepcopy(self._trabalho)
        self.commits += 1


class HasherDeSenhaFalso:
    """Satisfaz a porta HasherDeSenha sem custo; registra cada verificação feita."""

    def __init__(self) -> None:
        self.hashes = 0
        self.verificacoes = 0
        self.verificacoes_falsas = 0

    def hashear(self, senha: SenhaEmClaro) -> SenhaComHash:
        self.hashes += 1
        return SenhaComHash(f"falso${senha.valor[::-1]}")

    def verificar(self, senha: SenhaEmClaro, senha_hash: SenhaComHash) -> bool:
        self.verificacoes += 1
        return senha_hash.valor == f"falso${senha.valor[::-1]}"

    def verificar_falso(self, senha: SenhaEmClaro) -> None:
        self.verificacoes_falsas += 1


class GeradorDeSegredoFalso:
    """Satisfaz a porta GeradorDeSegredo com valores previsíveis e distintos."""

    def __init__(self) -> None:
        self._contador = 0

    def gerar(self) -> str:
        self._contador += 1
        return f"{self._contador:043d}"

    def gerar_prefixo(self) -> str:
        self._contador += 1
        return f"pre{self._contador:05d}"


class RelogioFalso:
    """Satisfaz a porta Relogio; o tempo só anda quando o teste manda."""

    def __init__(self, agora: datetime) -> None:
        self.instante = agora

    def agora(self) -> datetime:
        return self.instante

    def avancar(self, intervalo: timedelta) -> None:
        self.instante += intervalo


class LimitadorDeTentativasFalso:
    """Satisfaz a porta LimitadorDeTentativas; registra as chamadas e bloqueia sob comando."""

    def __init__(self) -> None:
        self.tentativas: list[tuple[str, ...]] = []
        self.zeradas: list[str] = []
        self.descontadas: list[str] = []
        self.bloqueado = False

    def registrar_tentativa(self, chaves: Sequence[str]) -> None:
        if self.bloqueado:
            raise MuitasTentativas(60)
        self.tentativas.append(tuple(chaves))

    def zerar(self, chave: str) -> None:
        self.zeradas.append(chave)

    def descontar(self, chave: str) -> None:
        self.descontadas.append(chave)


AGORA = datetime(2026, 10, 12, 12, 0, tzinfo=UTC)


@pytest.fixture
def limitador() -> LimitadorDeTentativasFalso:
    return LimitadorDeTentativasFalso()


@pytest.fixture
def hasher() -> HasherDeSenhaFalso:
    return HasherDeSenhaFalso()


@pytest.fixture
def gerador() -> GeradorDeSegredoFalso:
    return GeradorDeSegredoFalso()


@pytest.fixture
def relogio() -> RelogioFalso:
    return RelogioFalso(AGORA)


@pytest.fixture
def unidade_de_trabalho() -> UnidadeDeTrabalhoEmMemoria:
    return UnidadeDeTrabalhoEmMemoria()


@pytest.fixture
def semear_conta(unidade_de_trabalho: UnidadeDeTrabalhoEmMemoria) -> Callable[..., Conta]:
    """Grava uma conta direto no estado confirmado, sem passar por caso de uso nem commit."""

    def semear(
        usuario_id: UUID | None = None,
        nome: str = "Carteira",
        saldo: Dinheiro | None = None,
    ) -> Conta:
        conta = Conta(
            usuario_id=usuario_id or uuid4(),
            nome=nome,
            saldo=saldo if saldo is not None else Dinheiro(10000),
        )
        unidade_de_trabalho.confirmado.contas[conta.id] = copy.deepcopy(conta)
        return conta

    return semear


@pytest.fixture
def semear_usuario(
    unidade_de_trabalho: UnidadeDeTrabalhoEmMemoria, hasher: HasherDeSenhaFalso
) -> Callable[..., Usuario]:
    """Grava um usuário com e-mail e senha direto no estado confirmado."""

    def semear(email: str = "ana@x.com", senha: str = "senha-correta") -> Usuario:
        usuario = Usuario(
            "Ana",
            email=Email.de_texto(email),
            senha_hash=hasher.hashear(SenhaEmClaro(senha)),
        )
        unidade_de_trabalho.confirmado.usuarios[usuario.id] = copy.deepcopy(usuario)
        hasher.hashes = 0
        return usuario

    return semear
