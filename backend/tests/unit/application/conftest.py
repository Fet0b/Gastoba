import copy
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field, replace
from datetime import UTC, date, datetime, timedelta
from types import TracebackType
from typing import Self
from uuid import UUID, uuid4

import pytest

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.chave_de_api import ChaveDeApi
from gastoba.domain.cobertura_de_compra import CoberturaDeCompra
from gastoba.domain.conta import Conta, OrigemDaConta, TipoDaConta
from gastoba.domain.cor_da_destinacao import CorDaDestinacao
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
from gastoba.domain.fatura import CompraDoCartao, Fatura, PagamentoDeFatura
from gastoba.domain.ganho import Ganho
from gastoba.domain.gasto import Gasto
from gastoba.domain.investimento import Investimento, PontoDoHistorico, Realocacao
from gastoba.domain.meta import AlvoDaMeta, Meta
from gastoba.domain.movimento_de_investimento import (
    MovimentoDeInvestimento,
    OrigemDoMovimento,
    TipoDeMovimento,
)
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.recorrencia import Recorrencia
from gastoba.domain.senha import SenhaComHash, SenhaEmClaro
from gastoba.domain.sessao import Sessao
from gastoba.domain.tag import Tag
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)
from gastoba.domain.usuario import Usuario


@dataclass
class EstadoEmMemoria:
    """Tabelas em memória, indexadas por ``id``."""

    usuarios: dict[UUID, Usuario] = field(default_factory=dict)
    contas: dict[UUID, Conta] = field(default_factory=dict)
    cores_das_destinacoes: dict[tuple[UUID, Tag], CorDaDestinacao] = field(default_factory=dict)
    # (movimento, tag) -> categoria foto do vínculo na hora do aporte.
    categorias_das_partes: dict[tuple[UUID, Tag], CategoriaDoGasto] = field(default_factory=dict)
    reaplicacoes_de_resgates: dict = field(default_factory=dict)
    coberturas: dict[UUID, CoberturaDeCompra] = field(default_factory=dict)
    faturas: dict[UUID, Fatura] = field(default_factory=dict)
    # compra (transação importada) -> fatura; ausente = sem fatura.
    fatura_da_compra: dict[UUID, UUID] = field(default_factory=dict)
    gastos: dict[UUID, Gasto] = field(default_factory=dict)
    ganhos: dict[UUID, Ganho] = field(default_factory=dict)
    referencias_de_caixinhas: dict = field(default_factory=dict)
    transferencias: dict = field(default_factory=dict)
    posicoes: set = field(default_factory=set)
    observacoes: dict = field(default_factory=dict)
    tags_cadastradas: dict = field(default_factory=dict)
    operacoes: dict = field(default_factory=dict)
    alocacoes: dict = field(default_factory=dict)
    casamentos: dict = field(default_factory=dict)
    tratamentos: dict = field(default_factory=dict)
    reversoes_de_classificacao: list = field(default_factory=list)
    transacoes_importadas: dict[UUID, TransacaoImportada] = field(default_factory=dict)
    investimentos: dict[tuple[UUID, str], InvestimentoExterno] = field(default_factory=dict)
    movimentos_de_investimento: dict[UUID, MovimentoDeInvestimento] = field(default_factory=dict)
    ids_de_investimentos: dict[tuple[UUID, str], UUID] = field(default_factory=dict)
    historico_de_investimentos: dict[tuple[UUID, date], Dinheiro] = field(default_factory=dict)
    destinacoes: list[tuple[UUID, Tag, Dinheiro, Dinheiro | None]] = field(default_factory=list)
    realocacoes: dict[UUID, Realocacao] = field(default_factory=dict)
    recorrencias: dict[UUID, Recorrencia] = field(default_factory=dict)
    historico_de_metas: list = field(default_factory=list)
    metas: dict[UUID, Meta] = field(default_factory=dict)
    rendas_base: dict[UUID, Dinheiro] = field(default_factory=dict)
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
    def definir_papel(self, usuario_id, conta_id, papel):
        conta = self._estado.contas.get(conta_id)
        if conta and conta.usuario_id == usuario_id:
            conta.papel = papel

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

    def excluir(self, usuario_id: UUID, id: UUID) -> None:
        conta = self._estado.contas.get(id)
        if conta is None or conta.usuario_id != usuario_id:
            raise ContaNaoEncontrada("Conta não encontrada.")
        del self._estado.contas[id]

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

    def obter(self, usuario_id: UUID, id: UUID) -> Gasto | None:
        return next(
            (copy.deepcopy(g) for g in self._gastos_do_usuario(usuario_id) if g.id == id), None
        )

    def alterar_categoria(self, id: UUID, categoria: CategoriaDoGasto) -> None:
        self._estado.gastos[id].categoria = categoria

    def listar_da_categoria_legada(self, usuario_id: UUID) -> list[Gasto]:
        return self.listar(usuario_id, date.min, date.max, categoria=CategoriaDoGasto.INVESTIMENTOS)

    def da_transacao(self, usuario_id: UUID, transacao_id: UUID) -> list[Gasto]:
        return [
            lancamento
            for lancamento in self.listar(usuario_id, date.min, date.max)
            if lancamento.transacao_importada_id == transacao_id
        ]

    def existe_correspondente_sem_vinculo(
        self, usuario_id: UUID, conta_id: UUID, data: date, valor: Dinheiro, descricao: str
    ) -> bool:
        return any(
            (
                lancamento.conta_id,
                lancamento.valor,
                lancamento.descricao,
                lancamento.origem,
                lancamento.transacao_importada_id,
            )
            == (conta_id, valor, descricao, "open_finance", None)
            for lancamento in self.listar(usuario_id, data, data)
        )

    def remover(self, id: UUID) -> None:
        self._estado.gastos.pop(id, None)

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
                totais[gasto.categoria] = (
                    totais.get(gasto.categoria, Dinheiro(0))
                    + gasto.valor
                    - RepositorioDeCoberturasEmMemoria(self._estado).somar_do_gasto(gasto.id)
                )
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


class RepositorioDeCoresDasDestinacoesEmMemoria:
    def __init__(self, estado):
        self._estado = estado

    def definir(self, usuario_id, tag, cor):
        self._estado.cores_das_destinacoes[usuario_id, tag] = cor

    def remover(self, usuario_id, tag):
        self._estado.cores_das_destinacoes.pop((usuario_id, tag), None)

    def listar(self, usuario_id):
        return {
            tag: cor
            for (dono, tag), cor in self._estado.cores_das_destinacoes.items()
            if dono == usuario_id
        }


class RepositorioDeCoberturasEmMemoria:
    def listar_por_resgates(self, usuario_id, movimento_ids):
        return [
            copy.deepcopy(c)
            for c in self._estado.coberturas.values()
            if c.movimento_id in movimento_ids and self.obter(usuario_id, c.id)
        ]

    def __init__(self, estado):
        self._estado = estado

    def adicionar(self, cobertura):
        self._estado.coberturas[cobertura.id] = copy.deepcopy(cobertura)

    def obter(self, usuario_id, id):
        c = self._estado.coberturas.get(id)
        return (
            copy.deepcopy(c)
            if c and RepositorioDeGastosEmMemoria(self._estado).obter(usuario_id, c.gasto_id)
            else None
        )

    def remover(self, id):
        self._estado.coberturas.pop(id, None)

    def remover_dos_gastos(self, gasto_ids):
        for id, c in list(self._estado.coberturas.items()):
            if c.gasto_id in gasto_ids:
                self.remover(id)

    def listar_dos_gastos(self, gasto_ids):
        resultado = {}
        for c in self._estado.coberturas.values():
            if c.gasto_id in gasto_ids:
                resultado.setdefault(c.gasto_id, []).append(copy.deepcopy(c))
        return resultado

    def somar_do_gasto(self, gasto_id):
        return Dinheiro(
            sum(
                c.valor.centavos for c in self._estado.coberturas.values() if c.gasto_id == gasto_id
            )
        )

    def tags_do_gasto(self, gasto_id):
        return frozenset(c.tag for c in self._estado.coberturas.values() if c.gasto_id == gasto_id)

    def somar_coberto_por_tag(self, usuario_id, categoria):
        gastos = {
            g.id
            for g in RepositorioDeGastosEmMemoria(self._estado).listar(
                usuario_id, date.min, date.max, categoria=categoria
            )
        }
        totais = {}
        for c in self._estado.coberturas.values():
            if c.gasto_id in gastos:
                em_principal = c.valor if c.principal is None else c.principal
                totais[c.tag] = totais.get(c.tag, Dinheiro(0)) + em_principal
        return totais

    def usado_do_resgate(self, movimento_id, tag):
        return Dinheiro(
            sum(
                c.valor.centavos
                for c in self._estado.coberturas.values()
                if c.movimento_id == movimento_id and c.tag == tag
            )
        )

    def usado_dos_resgates(self, movimento_ids):
        resultado = {}
        for c in self._estado.coberturas.values():
            if c.movimento_id in movimento_ids:
                por_tag = resultado.setdefault(c.movimento_id, {})
                por_tag[c.tag] = por_tag.get(c.tag, Dinheiro(0)) + c.valor
        return resultado

    def resgate_em_uso(self, movimento_ids):
        return any(c.movimento_id in movimento_ids for c in self._estado.coberturas.values())

    def somar_adicional_por_categoria(self, usuario_id, inicio, fim):
        gastos = {
            g.id: g
            for g in RepositorioDeGastosEmMemoria(self._estado).listar(usuario_id, inicio, fim)
        }
        resultado = {}
        for c in self._estado.coberturas.values():
            gasto = gastos.get(c.gasto_id)
            if gasto is not None and c.movimento_id is not None:
                por_tag = resultado.setdefault(gasto.categoria, {})
                por_tag[c.tag] = por_tag.get(c.tag, Dinheiro(0)) + c.valor
        return resultado


class RepositorioDeGanhosEmMemoria:
    """Satisfaz a porta RepositorioDeGanhos; só enxerga ganhos das contas do usuário."""

    def da_transacao(self, usuario_id: UUID, transacao_id: UUID) -> list[Ganho]:
        return [
            lancamento
            for lancamento in self.listar(usuario_id, date.min, date.max)
            if lancamento.transacao_importada_id == transacao_id
        ]

    def existe_correspondente_sem_vinculo(
        self, usuario_id: UUID, conta_id: UUID, data: date, valor: Dinheiro, descricao: str
    ) -> bool:
        return any(
            (
                lancamento.conta_id,
                lancamento.valor,
                lancamento.descricao,
                lancamento.origem,
                lancamento.transacao_importada_id,
            )
            == (conta_id, valor, descricao, "open_finance", None)
            for lancamento in self.listar(usuario_id, data, data)
        )

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


class RepositorioDeInvestimentosEmMemoria:
    def definir_referencia_da_caixinha(self, referencia):
        self._estado.referencias_de_caixinhas[(referencia.investimento_id, str(referencia.mes))] = (
            copy.deepcopy(referencia)
        )

    def referencia_da_caixinha(self, investimento_id, mes):
        return copy.deepcopy(self._estado.referencias_de_caixinhas.get((investimento_id, str(mes))))

    """Satisfaz a porta RepositorioDeInvestimentos por tipagem estrutural."""

    def existe_algum(self, usuario_id: UUID) -> bool:
        return bool(self.listar(usuario_id))

    def __init__(self, estado: EstadoEmMemoria) -> None:
        self._estado = estado

    def salvar_posicao(
        self, usuario_id: UUID, investimento: InvestimentoExterno, hoje: date | None = None
    ) -> None:
        chave = (usuario_id, investimento.id_externo)
        self._estado.investimentos[chave] = investimento
        id_do_investimento = self._estado.ids_de_investimentos.setdefault(chave, uuid4())
        if hoje is not None:
            self._estado.historico_de_investimentos[(id_do_investimento, hoje)] = investimento.saldo

    def listar_posicoes(self, usuario_id: UUID) -> list[Investimento]:
        posicoes = []
        for externo in self.listar(usuario_id):
            id_do_investimento = self._estado.ids_de_investimentos[(usuario_id, externo.id_externo)]
            datas = [
                dia
                for (investimento_id, dia) in self._estado.historico_de_investimentos
                if investimento_id == id_do_investimento
            ]
            posicoes.append(
                Investimento(
                    id=id_do_investimento,
                    id_externo=externo.id_externo,
                    nome=externo.nome,
                    tipo=externo.tipo,
                    subtipo=externo.subtipo,
                    saldo=externo.saldo,
                    atualizado_em=max(datas, default=None),
                    valor_aplicado=externo.valor_aplicado,
                    rendimento=externo.rendimento,
                    conta_remunerada_id=externo.conta_remunerada_id,
                    **_campos_do_registro(externo.dados),
                )
            )
        return posicoes

    def obter(self, usuario_id: UUID, id: UUID) -> Investimento | None:
        return next((p for p in self.listar_posicoes(usuario_id) if p.id == id), None)

    def historico(self, usuario_id: UUID, inicio: date, fim: date) -> list[PontoDoHistorico]:
        meus = {p.id for p in self.listar_posicoes(usuario_id)}
        pontos = [
            PontoDoHistorico(investimento_id, dia, saldo)
            for (investimento_id, dia), saldo in self._estado.historico_de_investimentos.items()
            if investimento_id in meus and inicio <= dia <= fim
        ]
        return sorted(pontos, key=lambda p: (p.data, str(p.investimento_id)))

    def saldo_antes_de(self, usuario_id: UUID, id: UUID, data: date) -> Dinheiro | None:
        if self.obter(usuario_id, id) is None:
            return None
        anteriores = [
            (dia, saldo)
            for (investimento_id, dia), saldo in self._estado.historico_de_investimentos.items()
            if investimento_id == id and dia < data
        ]
        return max(anteriores, key=lambda ponto: ponto[0])[1] if anteriores else None

    def listar(self, usuario_id: UUID) -> list[InvestimentoExterno]:
        return sorted(
            (i for (dono, _), i in self._estado.investimentos.items() if dono == usuario_id),
            key=lambda i: (i.nome, i.id_externo),
        )


class RepositorioDeMovimentosDeInvestimentoEmMemoria:
    def listar_relacionados(self, usuario_id, ids):
        return [
            m
            for m in self.listar(usuario_id, date.min, date.max)
            if m.movimento_relacionado_id in ids
        ]

    """Satisfaz a porta RepositorioDeMovimentosDeInvestimento por tipagem estrutural."""

    def da_transacao(self, usuario_id: UUID, transacao_id: UUID) -> list[MovimentoDeInvestimento]:
        return [
            lancamento
            for lancamento in self.listar(usuario_id, date.min, date.max)
            if lancamento.transacao_importada_id == transacao_id
        ]

    def contar_correspondentes_sem_vinculo(
        self,
        usuario_id: UUID,
        conta_id: UUID,
        data: date,
        valor: Dinheiro,
        descricao: str,
        tipo: TipoDeMovimento,
    ) -> int:
        return sum(
            1
            for m in self.listar(usuario_id, data, data)
            if (m.conta_id, m.valor, m.descricao, m.tipo, m.transacao_importada_id)
            == (conta_id, valor, descricao, tipo, None)
        )

    def existe_algum(self, usuario_id: UUID) -> bool:
        return bool(self.listar(usuario_id, date.min, date.max))

    def __init__(self, estado: EstadoEmMemoria) -> None:
        self._estado = estado

    def adicionar(self, movimento: MovimentoDeInvestimento) -> None:
        self._estado.movimentos_de_investimento[movimento.id] = copy.deepcopy(movimento)

    def somar_aportes_por_categoria(
        self, usuario_id: UUID, inicio: date, fim: date
    ) -> dict[CategoriaDoGasto, Dinheiro]:
        totais = {}
        for m in self.listar(usuario_id, inicio, fim):
            if (
                m.tipo == TipoDeMovimento.APORTE
                and m.origem != OrigemDoMovimento.SALDO_INICIAL
                and m.categoria is not None
                and not any(c[0] == m.id for c in self._estado.categorias_das_partes)
            ):
                totais[m.categoria] = totais.get(m.categoria, Dinheiro(0)) + m.valor
        return totais

    def listar_pendentes_de_revisao(self, usuario_id: UUID) -> list[MovimentoDeInvestimento]:
        return [
            m
            for m in self.listar(usuario_id, date.min, date.max)
            if m.revisao_pendente
            and m.tipo == TipoDeMovimento.APORTE
            and m.origem != OrigemDoMovimento.SALDO_INICIAL
        ]

    def listar_resgates_sem_destinacao(self, usuario_id):
        com_tag = {d[0] for d in self._estado.destinacoes}
        return [
            m
            for m in self.listar(usuario_id, date.min, date.max)
            if m.tipo == TipoDeMovimento.RESGATE and m.id not in com_tag
        ]

    def gravar_natureza_do_resgate(self, movimento: MovimentoDeInvestimento) -> None:
        self._estado.movimentos_de_investimento[
            movimento.id
        ].vencimento_confirmado = movimento.vencimento_confirmado

    def gravar_revisao(self, movimento: MovimentoDeInvestimento) -> None:
        m = self._estado.movimentos_de_investimento[movimento.id]
        m.categoria = movimento.categoria
        m.revisao_pendente = movimento.revisao_pendente

    def _e_de_caixinha(self, movimento: MovimentoDeInvestimento) -> bool:
        for chave, id_do_investimento in self._estado.ids_de_investimentos.items():
            if id_do_investimento == movimento.investimento_id:
                return self._estado.investimentos[chave].tipo == "CAIXINHA"
        return False

    def somar_aportes(self, usuario_id: UUID, inicio: date, fim: date) -> Dinheiro:
        total = Dinheiro(0)
        for movimento in self._estado.movimentos_de_investimento.values():
            if (
                self._e_do_usuario(movimento, usuario_id)
                and movimento.tipo == TipoDeMovimento.APORTE
                and movimento.origem != OrigemDoMovimento.SALDO_INICIAL
                and inicio <= movimento.data <= fim
                and not self._e_de_caixinha(movimento)
                and not self._tratado(movimento.id)
            ):
                total = total + movimento.valor
        return total

    def excluir(self, id: UUID) -> None:
        self._estado.movimentos_de_investimento.pop(id, None)
        self._estado.destinacoes[:] = [d for d in self._estado.destinacoes if d[0] != id]

    def _e_do_usuario(self, movimento: MovimentoDeInvestimento, usuario_id: UUID) -> bool:
        if movimento.conta_id is None:
            # O saldo inicial não tem conta: o dono é o do investimento.
            return (usuario_id, movimento.investimento_id) in {
                (dono, i) for (dono, _), i in self._estado.ids_de_investimentos.items()
            }
        conta = self._estado.contas.get(movimento.conta_id)
        return conta is not None and conta.usuario_id == usuario_id

    def obter(self, usuario_id: UUID, id: UUID) -> MovimentoDeInvestimento | None:
        movimento = self._estado.movimentos_de_investimento.get(id)
        if movimento is None or not self._e_do_usuario(movimento, usuario_id):
            return None
        return copy.deepcopy(movimento)

    def listar(self, usuario_id: UUID, inicio: date, fim: date) -> list[MovimentoDeInvestimento]:
        movimentos = [
            m
            for m in self._estado.movimentos_de_investimento.values()
            if inicio <= m.data <= fim
            and self.obter(usuario_id, m.id) is not None
            and not self._tratado(m.id)
        ]
        return sorted(movimentos, key=lambda m: m.data, reverse=True)

    def _tratado(self, movimento_id) -> bool:
        return any(
            t.movimento_id == movimento_id and t.afeta_os_totais
            for t in self._estado.tratamentos.values()
        )

    def associar(self, id: UUID, investimento_id: UUID) -> None:
        self._estado.movimentos_de_investimento[id].investimento_id = investimento_id

    def saldos_iniciais_do_investimento(self, usuario_id: UUID, investimento_id: UUID):
        return sorted(
            (
                m
                for m in self._estado.movimentos_de_investimento.values()
                if m.investimento_id == investimento_id
                and m.origem == OrigemDoMovimento.SALDO_INICIAL
                and self._e_do_usuario(m, usuario_id)
            ),
            key=lambda m: (m.data, str(m.id)),
        )

    def investimentos_com_movimento(self, usuario_id: UUID) -> set[UUID]:
        meus = {
            investimento_id
            for (dono, _), investimento_id in self._estado.ids_de_investimentos.items()
            if dono == usuario_id
        }
        return {
            m.investimento_id
            for m in self._estado.movimentos_de_investimento.values()
            if m.investimento_id in meus
        }


class RepositorioDeDestinacoesEmMemoria:
    """Satisfaz a porta RepositorioDeDestinacoes por tipagem estrutural."""

    def somar_reservado_por_tag(
        self, usuario_id: UUID, categoria: CategoriaDoGasto
    ) -> dict[Tag, Dinheiro]:
        meus = {
            m.id
            for m in RepositorioDeMovimentosDeInvestimentoEmMemoria(self._estado).listar(
                usuario_id, date.min, date.max
            )
            if m.tipo == TipoDeMovimento.APORTE
        }
        totais = {}
        for m, tag, valor, _ in self._estado.destinacoes:
            if m not in meus or valor.centavos <= 0:
                continue
            da_parte = self._estado.categorias_das_partes.get((m, tag))
            movimento = self._estado.movimentos_de_investimento[m]
            vinculada = any(chave[0] == m for chave in self._estado.categorias_das_partes)
            if da_parte == categoria or (
                da_parte is None and movimento.categoria == categoria and not vinculada
            ):
                totais[tag] = totais.get(tag, Dinheiro(0)) + valor
        return totais

    def somar_partes_por_categoria(self, usuario_id, inicio, fim):
        totais = {}
        for m in RepositorioDeMovimentosDeInvestimentoEmMemoria(self._estado).listar(
            usuario_id, inicio, fim
        ):
            if m.tipo != TipoDeMovimento.APORTE or m.origem == OrigemDoMovimento.SALDO_INICIAL:
                continue
            for movimento_id, tag, valor, _ in self._estado.destinacoes:
                categoria = self._estado.categorias_das_partes.get((movimento_id, tag))
                if movimento_id == m.id and valor.centavos > 0 and categoria is not None:
                    totais[categoria] = totais.get(categoria, Dinheiro(0)) + valor
        return totais

    def categorias_das_partes(self, movimento_ids):
        resultado = {}
        for (movimento_id, tag), categoria in self._estado.categorias_das_partes.items():
            if movimento_id in movimento_ids:
                resultado.setdefault(movimento_id, {})[tag] = categoria
        return resultado

    def resgate_da_tag(self, movimento_id, tag):
        for m, t, valor, principal in self._estado.destinacoes:
            if m == movimento_id and t == tag and valor.centavos < 0:
                return Dinheiro(-valor.centavos), Dinheiro(
                    -(valor if principal is None else principal).centavos
                )
        return None

    def __init__(self, estado: EstadoEmMemoria) -> None:
        self._estado = estado

    def adicionar(self, movimento_id, partes) -> None:
        for parte in partes:
            self._estado.destinacoes.append((movimento_id, parte.tag, parte.valor, parte.principal))
            if parte.categoria is not None:
                self._estado.categorias_das_partes[movimento_id, parte.tag] = parte.categoria

    def do_movimento(self, movimento_ids) -> dict[UUID, list[tuple[Tag, Dinheiro]]]:
        partes: dict[UUID, list[tuple[Tag, Dinheiro]]] = {}
        for movimento_id, tag, valor, _ in self._estado.destinacoes:
            if movimento_id in movimento_ids:
                partes.setdefault(movimento_id, []).append((tag, valor))
        return {m: sorted(p, key=lambda parte: parte[0].valor) for m, p in partes.items()}

    def principais(self, usuario_id: UUID) -> dict[UUID, dict[Tag, Dinheiro]]:
        meus = {
            id_do_investimento
            for (dono, _), id_do_investimento in self._estado.ids_de_investimentos.items()
            if dono == usuario_id
        }
        totais: dict[UUID, dict[Tag, int]] = {}

        def somar(investimento_id: UUID, tag: Tag, centavos: int) -> None:
            por_tag = totais.setdefault(investimento_id, {})
            por_tag[tag] = por_tag.get(tag, 0) + centavos

        for movimento_id, tag, valor, principal in self._estado.destinacoes:
            movimento = self._estado.movimentos_de_investimento.get(movimento_id)
            investimento_id = movimento.investimento_id if movimento else None
            if investimento_id in meus:
                somar(investimento_id, tag, (valor if principal is None else principal).centavos)
        for r in self._estado.realocacoes.values():
            if r.investimento_id in meus:
                somar(r.investimento_id, r.origem, -r.valor.centavos)
                somar(r.investimento_id, r.destino, r.valor.centavos)
        return {
            i: {tag: Dinheiro(c) for tag, c in por_tag.items() if c != 0}
            for i, por_tag in totais.items()
        }

    def adicionar_realocacao(self, realocacao: Realocacao) -> None:
        self._estado.realocacoes[realocacao.id] = realocacao

    def excluir_realocacao(self, realocacao_id: UUID) -> None:
        self._estado.realocacoes.pop(realocacao_id, None)

    def listar_realocacoes(self, usuario_id: UUID, investimento_id: UUID) -> list[Realocacao]:
        return sorted(
            (r for r in self._estado.realocacoes.values() if r.investimento_id == investimento_id),
            key=lambda r: r.data,
            reverse=True,
        )


class RepositorioDeTransacoesImportadasEmMemoria:
    def reservar_reversao(self, transacao_id, estado_anterior, reversoes):
        t = self._estado.transacoes_importadas.get(transacao_id)
        if (
            t is None
            or t.estado != estado_anterior
            or self.contar_reversoes(transacao_id) != reversoes
        ):
            return False
        t.estado = EstadoDaTransacaoImportada.PENDENTE
        return True

    def contar_reversoes(self, transacao_id):
        return sum(r.transacao_id == transacao_id for r in self._estado.reversoes_de_classificacao)

    def abatimentos_da_transacao(self, usuario_id, transacao_id):
        return [
            r
            for registro in self._estado.reversoes_de_classificacao
            if registro.usuario_id == usuario_id and registro.transacao_id == transacao_id
            for r in registro.lancamentos
            if r.get("tipo") == "AbatimentoDeSaldoInicial"
        ]

    def registrar_reversao(self, reversao):
        self._estado.reversoes_de_classificacao.append(copy.deepcopy(reversao))

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
        vinculadas = {
            lancamento.transacao_importada_id
            for registros in (
                self._estado.gastos,
                self._estado.ganhos,
                self._estado.movimentos_de_investimento,
            )
            for lancamento in registros.values()
        }
        return [
            copy.deepcopy(t)
            for t in self._do_usuario(usuario_id)
            if (t.conta_id, t.data, t.valor, t.descricao, t.sentido, t.estado)
            == (conta_id, data, valor, descricao, sentido, EstadoDaTransacaoImportada.ACEITA)
            and t.id not in vinculadas
        ]

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

    def listar_da_categoria_legada(self, usuario_id: UUID) -> list[Recorrencia]:
        return [r for r in self.listar(usuario_id) if r.categoria == CategoriaDoGasto.INVESTIMENTOS]

    def alterar_categoria(self, id: UUID, categoria: CategoriaDoGasto) -> None:
        self._estado.recorrencias[id].categoria = categoria

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


class RepositorioDeRendaBaseEmMemoria:
    def __init__(self, estado: EstadoEmMemoria) -> None:
        self._estado = estado

    def obter(self, usuario_id: UUID) -> Dinheiro | None:
        return self._estado.rendas_base.get(usuario_id)

    def definir(self, usuario_id: UUID, valor: Dinheiro) -> None:
        self._estado.rendas_base[usuario_id] = valor

    def remover(self, usuario_id: UUID) -> None:
        self._estado.rendas_base.pop(usuario_id, None)


class RepositorioDeHistoricoDeMetasEmMemoria:
    def __init__(self, estado):
        self._estado = estado

    def registrar(self, registro):
        self._estado.historico_de_metas.append(registro)

    def listar(self, usuario_id, limite=100):
        return sorted(
            [r for r in self._estado.historico_de_metas if r.usuario_id == usuario_id],
            key=lambda r: r.instante,
            reverse=True,
        )[:limite]


class RepositorioDeReaplicacoesDeResgatesEmMemoria:
    def __init__(self, estado):
        self._estado = estado

    def bloquear(self, usuario_id):
        pass

    def listar(self, usuario_id):
        movimentos = self._estado.movimentos_de_investimento
        return [
            copy.deepcopy(r)
            for r in self._estado.reaplicacoes_de_resgates.values()
            if r.aporte_id in movimentos
            and self._estado.contas[movimentos[r.aporte_id].conta_id].usuario_id == usuario_id
        ]

    def obter(self, usuario_id, id):
        return next((r for r in self.listar(usuario_id) if r.id == id), None)

    def para_movimento(self, usuario_id, movimento_id):
        return next(
            (r for r in self.listar(usuario_id) if movimento_id in (r.aporte_id, r.resgate_id)),
            None,
        )

    def adicionar(self, r):
        from gastoba.domain.excecoes import ReaplicacaoJaExiste

        if any(
            x.aporte_id == r.aporte_id or x.resgate_id == r.resgate_id
            for x in self._estado.reaplicacoes_de_resgates.values()
        ):
            raise ReaplicacaoJaExiste("Movimento já vinculado.")
        self._estado.reaplicacoes_de_resgates[r.id] = copy.deepcopy(r)

    def remover(self, id):
        self._estado.reaplicacoes_de_resgates.pop(id)

    def somar_no_periodo(self, usuario_id, inicio, fim):
        total = 0
        investimentos = RepositorioDeInvestimentosEmMemoria(self._estado)
        for r in self.listar(usuario_id):
            m = self._estado.movimentos_de_investimento[r.aporte_id]
            posicao = investimentos.obter(usuario_id, m.investimento_id)
            if inicio <= m.data <= fim and posicao is not None and posicao.tipo != "CAIXINHA":
                total += r.valor.centavos
        return Dinheiro(total)


class RepositorioDeMetasEmMemoria:
    def bloquear(self, usuario_id: UUID) -> None:
        pass

    """Satisfaz a porta RepositorioDeMetas; devolve cópias, na ordem do enum."""

    def __init__(self, estado: EstadoEmMemoria) -> None:
        self._estado = estado

    def obter(self, usuario_id: UUID, categoria: AlvoDaMeta) -> Meta | None:
        for meta in self._estado.metas.values():
            if meta.usuario_id == usuario_id and meta.alvo == categoria:
                return copy.deepcopy(meta)
        return None

    def listar(self, usuario_id: UUID) -> list[Meta]:
        ordem = {categoria: posicao for posicao, categoria in enumerate(AlvoDaMeta)}
        metas = [m for m in self._estado.metas.values() if m.usuario_id == usuario_id]
        metas.sort(key=lambda m: ordem[m.alvo])
        return [copy.deepcopy(m) for m in metas]

    def salvar(self, meta: Meta) -> None:
        for existente in self._estado.metas.values():
            if existente.usuario_id == meta.usuario_id and existente.alvo == meta.alvo:
                existente.percentual = meta.percentual
                return
        self._estado.metas[meta.id] = copy.deepcopy(meta)

    def remover(self, usuario_id: UUID, categoria: AlvoDaMeta) -> None:
        for id, meta in list(self._estado.metas.items()):
            if meta.usuario_id == usuario_id and meta.alvo == categoria:
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


_FORA_DA_FATURA = ("PAGAMENTO_FATURA", "TRANSFERENCIA_MESMA_INSTITUICAO")


def _compra_do_cartao(t: TransacaoImportada) -> CompraDoCartao:
    return CompraDoCartao(
        id=t.id,
        data=t.data,
        valor=t.valor,
        sentido=t.sentido,
        id_da_fatura=t.id_externo_da_fatura,
        descricao=t.descricao,
        parcela_numero=t.parcela_numero,
        parcela_total=t.parcela_total,
        estado=t.estado,
    )


class RepositorioDeFaturasEmMemoria:
    """Satisfaz a porta RepositorioDeFaturas; só enxerga contas do usuário."""

    def __init__(self, estado: EstadoEmMemoria) -> None:
        self._estado = estado

    def salvar(self, conta_id: UUID, fatura: Fatura) -> None:
        for existente in self._estado.faturas.values():
            if existente.conta_id == conta_id and existente.fechamento == fatura.fechamento:
                fatura = replace(fatura, id=existente.id, conta_id=conta_id)
                break
        vistos = {}
        for p in fatura.pagamentos:
            vistos.setdefault((p.data, p.valor), p)
        self._estado.faturas[fatura.id] = replace(
            fatura, conta_id=conta_id, pagamentos=tuple(vistos.values())
        )

    def _contas_do_usuario(self, usuario_id: UUID) -> set[UUID]:
        return {c.id for c in self._estado.contas.values() if c.usuario_id == usuario_id}

    def listar(self, usuario_id: UUID, conta_id: UUID | None = None) -> list[Fatura]:
        contas = self._contas_do_usuario(usuario_id)
        faturas = [
            f
            for f in self._estado.faturas.values()
            if f.conta_id in contas and (conta_id is None or f.conta_id == conta_id)
        ]
        faturas.sort(key=lambda f: f.fechamento, reverse=True)
        return copy.deepcopy(faturas)

    def obter(self, usuario_id: UUID, id: UUID) -> Fatura | None:
        fatura = self._estado.faturas.get(id)
        if fatura is None or fatura.conta_id not in self._contas_do_usuario(usuario_id):
            return None
        return copy.deepcopy(fatura)

    def compras_da_fatura(self, usuario_id: UUID, fatura_id: UUID) -> list[CompraDoCartao]:
        contas = self._contas_do_usuario(usuario_id)
        compras = [
            _compra_do_cartao(t)
            for t in self._estado.transacoes_importadas.values()
            if t.conta_id in contas and self._estado.fatura_da_compra.get(t.id) == fatura_id
        ]
        return sorted(compras, key=lambda c: (c.data, c.id))

    def compras_da_conta(self, conta_id: UUID) -> list[CompraDoCartao]:
        compras = [
            _compra_do_cartao(t)
            for t in self._estado.transacoes_importadas.values()
            if t.conta_id == conta_id and t.tipo_de_operacao not in _FORA_DA_FATURA
        ]
        return sorted(compras, key=lambda c: (c.data, c.id))

    def pagamentos_da_conta(self, conta_id: UUID) -> list[PagamentoDeFatura]:
        return [
            PagamentoDeFatura(t.data, t.valor, None)
            for t in sorted(self._estado.transacoes_importadas.values(), key=lambda t: t.data)
            if t.conta_id == conta_id and t.tipo_de_operacao == "PAGAMENTO_FATURA"
        ]

    def vincular_compra(self, compra_id: UUID, fatura_id: UUID | None) -> None:
        if fatura_id is None:
            self._estado.fatura_da_compra.pop(compra_id, None)
        else:
            self._estado.fatura_da_compra[compra_id] = fatura_id


def _dono_do_investimento(estado, usuario_id, investimento_id):
    return any(
        u == usuario_id and i == investimento_id
        for (u, _), i in estado.ids_de_investimentos.items()
    )


class RepositorioDeOperacoesEmMemoria:
    def __init__(self, estado):
        self._estado = estado

    def garantir_posicao(self, usuario_id, investimento_id):
        if not _dono_do_investimento(self._estado, usuario_id, investimento_id):
            return False
        self._estado.posicoes.add(investimento_id)
        return True

    def adicionar(self, usuario_id, operacao):
        if not self.garantir_posicao(usuario_id, operacao.posicao_id):
            return False
        if operacao.id_externo is not None and any(
            o.posicao_id == operacao.posicao_id and o.id_externo == operacao.id_externo
            for o in self._estado.operacoes.values()
        ):
            return False
        self._estado.operacoes[operacao.id] = operacao
        return True

    def obter(self, usuario_id, operacao_id):
        o = self._estado.operacoes.get(operacao_id)
        if o and _dono_do_investimento(self._estado, usuario_id, o.posicao_id):
            return o
        return None

    def listar_da_posicao(self, usuario_id, posicao_id):
        if not _dono_do_investimento(self._estado, usuario_id, posicao_id):
            return []
        return sorted(
            (o for o in self._estado.operacoes.values() if o.posicao_id == posicao_id),
            key=lambda o: (o.data, str(o.id)),
        )

    def definir_observacao(
        self, usuario_id, investimento_id, quantidade, valor_de_mercado, atualizada_em
    ):
        if self.garantir_posicao(usuario_id, investimento_id):
            self._estado.observacoes[investimento_id] = (
                quantidade,
                valor_de_mercado,
                atualizada_em,
            )

    def atualizar(self, usuario_id, operacao):
        if self.obter(usuario_id, operacao.id):
            self._estado.operacoes[operacao.id] = operacao

    def remover(self, usuario_id, operacao_id):
        if self.obter(usuario_id, operacao_id):
            del self._estado.operacoes[operacao_id]


class RepositorioDeAlocacoesEmMemoria:
    def __init__(self, estado):
        self._estado = estado

    def ids_das_tags(self, usuario_id):
        return {
            tag: id for (u, tag), id in self._estado.tags_cadastradas.items() if u == usuario_id
        }

    def listar_da_posicao(self, usuario_id, posicao_id):
        if not _dono_do_investimento(self._estado, usuario_id, posicao_id):
            return []
        return sorted(
            self._estado.alocacoes.get(posicao_id, []), key=lambda a: str(a.destinacao_id)
        )

    def substituir(self, usuario_id, posicao_id, alocacoes):
        if _dono_do_investimento(self._estado, usuario_id, posicao_id):
            self._estado.alocacoes[posicao_id] = list(alocacoes)


class RepositorioDeCasamentosEmMemoria:
    def __init__(self, estado):
        self._estado = estado

    def _meu(self, usuario_id, casamento):
        return any(
            (operacao := self._estado.operacoes.get(operacao_id)) is not None
            and _dono_do_investimento(self._estado, usuario_id, operacao.posicao_id)
            for operacao_id in casamento.operacao_ids
        )

    def adicionar(self, usuario_id, casamento):
        self._estado.casamentos[casamento.id] = casamento

    def obter(self, usuario_id, casamento_id):
        c = self._estado.casamentos.get(casamento_id)
        return c if c and self._meu(usuario_id, c) else None

    def para_operacao(self, usuario_id, operacao_id):
        return next(
            (
                c
                for c in self._estado.casamentos.values()
                if operacao_id in c.operacao_ids and self._meu(usuario_id, c)
            ),
            None,
        )

    def listar(self, usuario_id):
        meus = [c for c in self._estado.casamentos.values() if self._meu(usuario_id, c)]
        return sorted(meus, key=lambda c: str(c.id))

    def transacoes_casadas(self, usuario_id):
        return {
            v.transacao_importada_id
            for c in self._estado.casamentos.values()
            if self._meu(usuario_id, c)
            for v in c.vinculos
        }

    def remover(self, usuario_id, casamento_id):
        if self.obter(usuario_id, casamento_id):
            del self._estado.casamentos[casamento_id]


class RepositorioDeTratamentosEmMemoria:
    def __init__(self, estado):
        self._estado = estado

    def _meu(self, usuario_id, tratamento):
        movimento = self._estado.movimentos_de_investimento.get(tratamento.movimento_id)
        if movimento is None or movimento.conta_id is None:
            return False
        conta = self._estado.contas.get(movimento.conta_id)
        return conta is not None and conta.usuario_id == usuario_id

    def adicionar(self, usuario_id, tratamento):
        self._estado.tratamentos[tratamento.id] = tratamento

    def obter(self, usuario_id, tratamento_id):
        t = self._estado.tratamentos.get(tratamento_id)
        return t if t and self._meu(usuario_id, t) else None

    def ativo_do_movimento(self, usuario_id, movimento_id):
        return next(
            (
                t
                for t in self._estado.tratamentos.values()
                if t.movimento_id == movimento_id and t.ativo and self._meu(usuario_id, t)
            ),
            None,
        )

    def listar(self, usuario_id):
        return sorted(
            (t for t in self._estado.tratamentos.values() if self._meu(usuario_id, t)),
            key=lambda t: (t.criado_em, str(t.id)),
        )

    def atualizar(self, usuario_id, tratamento):
        if self.obter(usuario_id, tratamento.id):
            self._estado.tratamentos[tratamento.id] = tratamento


class RepositorioDeTransferenciasEmMemoria:
    def __init__(self, estado):
        self._estado = estado

    def obter(self, usuario_id, transferencia_id):
        t = self._estado.transferencias.get(transferencia_id)
        return copy.deepcopy(t) if t and t.usuario_id == usuario_id else None

    def da_transacao(self, usuario_id, transacao_id):
        return next(
            (
                copy.deepcopy(t)
                for t in self._estado.transferencias.values()
                if t.usuario_id == usuario_id and t.ativa and transacao_id in t.transacao_ids
            ),
            None,
        )

    def listar(self, usuario_id, inicio, fim):
        return [
            copy.deepcopy(t)
            for t in self._estado.transferencias.values()
            if t.usuario_id == usuario_id and t.ativa and inicio <= t.data <= fim
        ]

    def salvar(self, transferencia):
        for tid in transferencia.transacao_ids:
            existente = self.da_transacao(transferencia.usuario_id, tid)
            if existente and existente.id != transferencia.id:
                from gastoba.domain.excecoes import TransacaoImportadaInvalida

                raise TransacaoImportadaInvalida("Ponta já usada.")
        self._estado.transferencias[transferencia.id] = copy.deepcopy(transferencia)


class UnidadeDeTrabalhoEmMemoria:
    """Satisfaz a porta UnidadeDeTrabalho; descarta no ``__exit__`` o que não foi confirmado."""

    usuarios: RepositorioDeUsuariosEmMemoria
    contas: RepositorioDeContasEmMemoria
    gastos: RepositorioDeGastosEmMemoria
    ganhos: RepositorioDeGanhosEmMemoria
    faturas: RepositorioDeFaturasEmMemoria
    transacoes_importadas: RepositorioDeTransacoesImportadasEmMemoria
    investimentos: RepositorioDeInvestimentosEmMemoria
    movimentos_de_investimento: RepositorioDeMovimentosDeInvestimentoEmMemoria
    destinacoes: RepositorioDeDestinacoesEmMemoria
    recorrencias: RepositorioDeRecorrenciasEmMemoria
    metas: RepositorioDeMetasEmMemoria
    renda_base: RepositorioDeRendaBaseEmMemoria
    sessoes: RepositorioDeSessoesEmMemoria
    chaves_de_api: RepositorioDeChavesDeApiEmMemoria

    def __init__(self) -> None:
        self.confirmado = EstadoEmMemoria()
        self.commits = 0
        self._trabalho: EstadoEmMemoria | None = None

    def __enter__(self) -> Self:
        self._trabalho = copy.deepcopy(self.confirmado)
        self.usuarios = RepositorioDeUsuariosEmMemoria(self._trabalho)
        self.transferencias = RepositorioDeTransferenciasEmMemoria(self._trabalho)
        self.operacoes = RepositorioDeOperacoesEmMemoria(self._trabalho)
        self.tratamentos = RepositorioDeTratamentosEmMemoria(self._trabalho)
        self.alocacoes = RepositorioDeAlocacoesEmMemoria(self._trabalho)
        self.casamentos = RepositorioDeCasamentosEmMemoria(self._trabalho)
        self.contas = RepositorioDeContasEmMemoria(self._trabalho)
        self.gastos = RepositorioDeGastosEmMemoria(self._trabalho)
        self.cores_das_destinacoes = RepositorioDeCoresDasDestinacoesEmMemoria(self._trabalho)
        self.coberturas = RepositorioDeCoberturasEmMemoria(self._trabalho)
        self.faturas = RepositorioDeFaturasEmMemoria(self._trabalho)
        self.ganhos = RepositorioDeGanhosEmMemoria(self._trabalho)
        self.transacoes_importadas = RepositorioDeTransacoesImportadasEmMemoria(self._trabalho)
        self.investimentos = RepositorioDeInvestimentosEmMemoria(self._trabalho)
        self.movimentos_de_investimento = RepositorioDeMovimentosDeInvestimentoEmMemoria(
            self._trabalho
        )
        self.destinacoes = RepositorioDeDestinacoesEmMemoria(self._trabalho)
        self.recorrencias = RepositorioDeRecorrenciasEmMemoria(self._trabalho)
        self.historico_de_metas = RepositorioDeHistoricoDeMetasEmMemoria(self._trabalho)
        self.reaplicacoes_de_resgates = RepositorioDeReaplicacoesDeResgatesEmMemoria(self._trabalho)
        self.metas = RepositorioDeMetasEmMemoria(self._trabalho)
        self.renda_base = RepositorioDeRendaBaseEmMemoria(self._trabalho)
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
        origem: OrigemDaConta = OrigemDaConta.MANUAL,
    ) -> Conta:
        conta = Conta(
            usuario_id=usuario_id or uuid4(),
            nome=nome,
            saldo=saldo if saldo is not None else Dinheiro(10000),
            origem=origem,
            id_externo=None if origem == OrigemDaConta.MANUAL else "externa-1",
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


def _campos_do_registro(dados: str) -> dict:
    """Como o repositório SQL: emissor, vencimento, código e situação do registro da Pluggy."""
    import json

    try:
        registro = json.loads(dados)
    except ValueError:
        return {}
    if not isinstance(registro, dict):
        return {}
    bruto = registro.get("dueDate")
    return {
        "emissor": registro.get("issuer"),
        "vencimento": date.fromisoformat(bruto[:10]) if isinstance(bruto, str) else None,
        "codigo": registro.get("code"),
        "situacao": registro.get("status"),
    }
