from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from types import TracebackType
from typing import Protocol, Self
from uuid import UUID

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.chave_de_api import ChaveDeApi
from gastoba.domain.conta import Conta, TipoDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.email import Email
from gastoba.domain.ganho import Ganho
from gastoba.domain.gasto import Gasto
from gastoba.domain.meta import Meta
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


class RepositorioDeUsuarios(Protocol):
    def obter(self, id: UUID) -> Usuario | None: ...

    def garantir(self, usuario: Usuario) -> None:
        """Grava o usuário; idempotente: ignora se o ``id`` já existe."""
        ...

    def obter_por_email(self, email: Email) -> Usuario | None: ...

    def salvar(self, usuario: Usuario) -> None:
        """Insere o usuário ou atualiza nome, e-mail e senha de um ``id`` existente.

        Levanta ``EmailJaCadastrado`` se o e-mail já pertencer a outro usuário.
        """
        ...


class RepositorioDeContas(Protocol):
    def adicionar(self, conta: Conta) -> None:
        """Grava a conta; levanta ``ContaJaExiste`` se o nome já for usado pelo usuário."""
        ...

    def obter(self, usuario_id: UUID, id: UUID) -> Conta | None: ...

    def obter_por_id_externo(self, usuario_id: UUID, id_externo: str) -> Conta | None:
        """A conta importada com esse id no provedor de Open Finance."""
        ...

    def listar(self, usuario_id: UUID) -> list[Conta]:
        """Contas do usuário, ordenadas por nome."""
        ...

    def atualizar_do_banco(self, id: UUID, saldo: Dinheiro, tipo: TipoDaConta) -> None:
        """Substitui saldo e tipo (espelho do banco); ``ContaNaoEncontrada`` se nada mudou."""
        ...

    def debitar(self, id: UUID, valor: Dinheiro) -> None:
        """Subtrai do saldo de forma atômica; ``ContaNaoEncontrada`` se nenhuma linha mudou."""
        ...

    def creditar(self, id: UUID, valor: Dinheiro) -> None:
        """Soma ao saldo de forma atômica; ``ContaNaoEncontrada`` se nenhuma linha mudou."""
        ...


class RepositorioDeGastos(Protocol):
    def adicionar(self, gasto: Gasto) -> None: ...

    def listar(
        self,
        usuario_id: UUID,
        inicio: date,
        fim: date,
        conta_id: UUID | None = None,
        tag: Tag | None = None,
        categoria: CategoriaDoGasto | None = None,
    ) -> list[Gasto]:
        """Gastos do usuário no período inclusivo, por data decrescente e, no empate, por id."""
        ...

    def somar_por_categoria(
        self, usuario_id: UUID, inicio: date, fim: date
    ) -> dict[CategoriaDoGasto, Dinheiro]:
        """Total gasto por categoria no período inclusivo; só as categorias que têm gasto."""
        ...

    def competencias_geradas(self, recorrencia_id: UUID) -> set[str]:
        """Competências (``AAAA-MM``) que a recorrência já gerou."""
        ...

    def listar_tags(self, usuario_id: UUID) -> list[Tag]:
        """Tags distintas usadas nos gastos do usuário, ordenadas."""
        ...


class RepositorioDeGanhos(Protocol):
    def adicionar(self, ganho: Ganho) -> None: ...

    def obter(self, usuario_id: UUID, id: UUID) -> Ganho | None:
        """O ganho, só se for de uma conta do usuário."""
        ...

    def remover(self, id: UUID) -> None:
        """Apaga o ganho; ``GanhoNaoEncontrado`` se nenhuma linha mudou."""
        ...

    def listar(
        self,
        usuario_id: UUID,
        inicio: date,
        fim: date,
        conta_id: UUID | None = None,
    ) -> list[Ganho]:
        """Ganhos do usuário no período inclusivo, por data decrescente e, no empate, por id."""
        ...

    def somar(self, usuario_id: UUID, inicio: date, fim: date) -> Dinheiro:
        """Total ganho (em todas as contas do usuário) no período inclusivo."""
        ...

    def competencias_geradas(self, recorrencia_id: UUID) -> set[str]:
        """Competências (``AAAA-MM``) que a recorrência já gerou."""
        ...


class RepositorioDeTransacoesImportadas(Protocol):
    def adicionar_se_nova(self, transacao: TransacaoImportada) -> bool:
        """Grava na caixa de entrada; ``False`` se a conta já tem uma com esse id externo."""
        ...

    def obter(self, usuario_id: UUID, id: UUID) -> TransacaoImportada | None:
        """A transação, só se for de uma conta do usuário."""
        ...

    def listar(
        self, usuario_id: UUID, estado: EstadoDaTransacaoImportada
    ) -> list[TransacaoImportada]:
        """Do usuário no estado dado, por data decrescente e, no empate, por id."""
        ...

    def atualizar_estado(self, transacao: TransacaoImportada) -> None: ...

    def data_mais_recente(self, conta_id: UUID) -> date | None:
        """A data da transação mais recente já importada para a conta, em qualquer estado."""
        ...


class RepositorioDeRecorrencias(Protocol):
    def adicionar(self, recorrencia: Recorrencia) -> None: ...

    def obter(self, usuario_id: UUID, id: UUID) -> Recorrencia | None: ...

    def listar(self, usuario_id: UUID) -> list[Recorrencia]:
        """Recorrências do usuário (ativas e encerradas), ordenadas por descrição e id."""
        ...

    def contar_ativas(self, usuario_id: UUID) -> int: ...

    def listar_ativas(self, usuario_id: UUID | None = None) -> list[Recorrencia]:
        """Recorrências ativas do usuário; sem ``usuario_id``, as de todos (a geração)."""
        ...

    def atualizar(self, recorrencia: Recorrencia) -> None:
        """Grava valor, descrição, dia, categoria, tags, fim e ativa de uma existente."""
        ...


class RepositorioDeMetas(Protocol):
    def obter(self, usuario_id: UUID, categoria: CategoriaDoGasto) -> Meta | None: ...

    def listar(self, usuario_id: UUID) -> list[Meta]:
        """Metas do usuário, na ordem do enum ``CategoriaDoGasto``."""
        ...

    def salvar(self, meta: Meta) -> None:
        """Cria a meta ou troca o percentual da que o usuário já tem para a categoria."""
        ...

    def remover(self, usuario_id: UUID, categoria: CategoriaDoGasto) -> None:
        """``MetaNaoEncontrada`` se o usuário não tem meta da categoria."""
        ...


class RepositorioDeSessoes(Protocol):
    def adicionar(self, sessao: Sessao) -> None: ...

    def obter_por_hash(self, hash_do_segredo: str) -> Sessao | None:
        """Busca pelo SHA-256 do token; o token em claro nunca chega ao repositório."""
        ...

    def revogar(self, id: UUID) -> None: ...


class RepositorioDeChavesDeApi(Protocol):
    def adicionar(self, chave: ChaveDeApi) -> None: ...

    def obter(self, usuario_id: UUID, id: UUID) -> ChaveDeApi | None:
        """A chave, só se pertencer ao usuário."""
        ...

    def obter_por_hash(self, hash_do_segredo: str) -> ChaveDeApi | None: ...

    def listar(self, usuario_id: UUID) -> list[ChaveDeApi]:
        """Chaves não revogadas do usuário, da mais nova para a mais antiga."""
        ...

    def revogar(self, id: UUID) -> None: ...

    def registrar_uso(self, id: UUID, quando: datetime) -> None: ...


class UnidadeDeTrabalho(Protocol):
    """Entrega os repositórios e controla a transação; usada em ``with`` sequenciais."""

    usuarios: RepositorioDeUsuarios
    contas: RepositorioDeContas
    gastos: RepositorioDeGastos
    ganhos: RepositorioDeGanhos
    transacoes_importadas: RepositorioDeTransacoesImportadas
    recorrencias: RepositorioDeRecorrencias
    metas: RepositorioDeMetas
    sessoes: RepositorioDeSessoes
    chaves_de_api: RepositorioDeChavesDeApi

    def __enter__(self) -> Self: ...

    def __exit__(
        self,
        tipo: type[BaseException] | None,
        valor: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        """Desfaz o que não foi confirmado com ``commit`` e fecha a sessão."""
        ...

    def commit(self) -> None: ...


@dataclass(frozen=True, slots=True)
class ContaExterna:
    """Conta bancária ou cartão como chega de um provedor de Open Finance."""

    id_externo: str
    nome: str
    # Já no sentido do Gastoba: o saldo do cartão é o negativo do valor devido.
    saldo: Dinheiro
    tipo: TipoDaConta = TipoDaConta.CORRENTE


@dataclass(frozen=True, slots=True)
class TransacaoExterna:
    """Transação bancária lançada (já postada) como chega de um provedor de Open Finance."""

    id_externo: str
    valor: Dinheiro
    descricao: str
    data: date
    sentido: SentidoDaTransacao
    tipo_de_operacao: str | None = None


class ProvedorOpenFinance(Protocol):
    """Fonte externa de contas e transações bancárias (ex.: Pluggy).

    Falhas do provedor (rede, credencial, resposta inesperada) viram ``ProvedorIndisponivel``.
    """

    def listar_contas(self, id_do_item: str) -> list[ContaExterna]: ...

    def listar_transacoes(self, id_da_conta: str, desde: date) -> list[TransacaoExterna]:
        """Transações lançadas (sem as pendentes) a partir de ``desde``, inclusive."""
        ...


class VerificadorDeBanco(Protocol):
    def esta_disponivel(self) -> bool: ...


class HasherDeSenha(Protocol):
    """Hash lento e com sal para senhas; a comparação é em tempo constante."""

    def hashear(self, senha: SenhaEmClaro) -> SenhaComHash: ...

    def verificar(self, senha: SenhaEmClaro, senha_hash: SenhaComHash) -> bool:
        """Diz se a senha confere com o hash; ``False`` também para hash corrompido."""
        ...

    def verificar_falso(self, senha: SenhaEmClaro) -> None:
        """Faz o mesmo trabalho de ``verificar`` contra um hash fixo e descarta o resultado.

        Usado quando o e-mail não existe, para o login levar o mesmo tempo nos dois casos.
        """
        ...


class GeradorDeSegredo(Protocol):
    def gerar(self) -> str:
        """Texto aleatório url-safe (``[A-Za-z0-9_-]``) com ao menos 32 caracteres."""
        ...

    def gerar_prefixo(self) -> str:
        """Prefixo público de chave de API: 8 letras ou dígitos aleatórios."""
        ...


class Relogio(Protocol):
    def agora(self) -> datetime:
        """Instante atual, com fuso UTC."""
        ...


class LimitadorDeTentativas(Protocol):
    """Limita tentativas de entrar por chave (ex.: ``email:<e-mail>``, ``origem:<ip>``)."""

    def registrar_tentativa(self, chaves: Sequence[str]) -> None:
        """Conta uma tentativa para cada chave, de forma atômica.

        Levanta ``MuitasTentativas``, sem contar nada, se alguma chave já atingiu o limite.
        """
        ...

    def zerar(self, chave: str) -> None:
        """Esquece todas as tentativas da chave (ex.: o e-mail, depois de entrar)."""
        ...

    def descontar(self, chave: str) -> None:
        """Devolve uma tentativa da chave (a que acabou dando certo)."""
        ...
