from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from types import TracebackType
from typing import Protocol, Self
from uuid import UUID

from gastoba.domain.alocacao_de_caixinha import AlocacaoDeCaixinha
from gastoba.domain.aparencia import Aparencia
from gastoba.domain.caixinha import ReferenciaMensalDaCaixinha
from gastoba.domain.caixinha_marcada import GuardadoNasMetas
from gastoba.domain.casamento_de_operacao import CasamentoDeOperacao
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.chave_de_api import ChaveDeApi
from gastoba.domain.cobertura_de_compra import CoberturaDeCompra
from gastoba.domain.conta import Conta, PapelDaConta, TipoDaConta
from gastoba.domain.cor_da_destinacao import CorDaDestinacao
from gastoba.domain.destinacao import ParteDeDestinacao
from gastoba.domain.destinacao_cadastrada import DestinacaoCadastrada, IconeDaCaixinha
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.email import Email
from gastoba.domain.fatura import CompraDoCartao, Fatura, FaturaExterna, PagamentoDeFatura
from gastoba.domain.ganho import Ganho
from gastoba.domain.gasto import Gasto
from gastoba.domain.historico_de_meta import HistoricoDeMeta
from gastoba.domain.investimento import Investimento, PontoDoHistorico, Realocacao
from gastoba.domain.mes import Mes
from gastoba.domain.meta import AlvoDaMeta, Meta
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.mudanca_de_fracao import MudancaDeFracao
from gastoba.domain.operacao import Operacao
from gastoba.domain.reaplicacao_de_resgate import ReaplicacaoDeResgate
from gastoba.domain.recorrencia import Recorrencia
from gastoba.domain.reversao_de_classificacao import ReversaoDeClassificacao
from gastoba.domain.senha import SenhaComHash, SenhaEmClaro
from gastoba.domain.sessao import Sessao
from gastoba.domain.tag import Tag
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)
from gastoba.domain.transferencia_entre_contas import TransferenciaEntreContas
from gastoba.domain.tratamento_de_aporte import TratamentoDeAporte
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
    def definir_papel(self, usuario_id: UUID, conta_id: UUID, papel: PapelDaConta) -> None: ...

    def adicionar(self, conta: Conta) -> None:
        """Grava a conta; levanta ``ContaJaExiste`` se o nome já for usado pelo usuário."""
        ...

    def obter(self, usuario_id: UUID, id: UUID) -> Conta | None: ...

    def obter_por_id_externo(self, usuario_id: UUID, id_externo: str) -> Conta | None:
        """A conta importada com esse id no provedor de Open Finance."""
        ...

    def listar(self, usuario_id: UUID) -> list[Conta]:
        """Contas do usuário, ordenadas pelo rótulo (sem distinguir maiúsculas) e pelo nome."""
        ...

    def excluir(self, usuario_id: UUID, id: UUID) -> None:
        """Apaga a conta com seus gastos, ganhos, recorrências e transações importadas.

        ``ContaNaoEncontrada`` se não existir ou for de outro usuário.
        """
        ...

    def atualizar_do_banco(
        self,
        id: UUID,
        saldo: Dinheiro,
        tipo: TipoDaConta,
        nome_no_banco: str | None,
        final_do_numero: str | None,
    ) -> None:
        """Substitui saldo, tipo, nome e final do número (espelho do banco).

        ``ContaNaoEncontrada`` se nada mudou.
        """
        ...

    def definir_apelido(self, usuario_id: UUID, id: UUID, apelido: str | None) -> None:
        """Grava (ou, com ``None``, remove) o apelido da conta da pessoa.

        ``ContaNaoEncontrada`` se a conta não for da pessoa; ``ApelidoJaExiste`` se outra conta
        dela já usa o apelido.
        """
        ...

    def debitar(self, id: UUID, valor: Dinheiro) -> None:
        """Subtrai do saldo de forma atômica; ``ContaNaoEncontrada`` se nenhuma linha mudou."""
        ...

    def creditar(self, id: UUID, valor: Dinheiro) -> None:
        """Soma ao saldo de forma atômica; ``ContaNaoEncontrada`` se nenhuma linha mudou."""
        ...


class RepositorioDeGastos(Protocol):
    def da_transacao(self, usuario_id: UUID, transacao_id: UUID) -> list[Gasto]:
        """Lançamentos vinculados à transação, somente de contas da pessoa."""
        ...

    def existe_correspondente_sem_vinculo(
        self, usuario_id: UUID, conta_id: UUID, data: date, valor: Dinheiro, descricao: str
    ) -> bool: ...

    def remover(self, id: UUID) -> None: ...

    def obter(self, usuario_id: UUID, id: UUID) -> Gasto | None: ...

    def alterar_categoria(self, id: UUID, categoria: CategoriaDoGasto) -> None: ...

    def listar_da_categoria_legada(self, usuario_id: UUID) -> list[Gasto]: ...

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


class RepositorioDeCoresDasDestinacoes(Protocol):
    def definir(self, usuario_id: UUID, tag: Tag, cor: CorDaDestinacao) -> None: ...
    def remover(self, usuario_id: UUID, tag: Tag) -> None: ...
    def listar(self, usuario_id: UUID) -> dict[Tag, CorDaDestinacao]: ...


class RepositorioDeFaturas(Protocol):
    """Só lê e grava: quem decide o ciclo de cada compra é o caso de uso (``atribuir_ciclo``)."""

    def salvar(self, conta_id: UUID, fatura: Fatura) -> None:
        """Grava; se a conta já tem fatura com esse fechamento, atualiza (idempotente)."""
        ...

    def listar(self, usuario_id: UUID, conta_id: UUID | None = None) -> list[Fatura]:
        """Do usuário, da mais recente para a mais antiga."""
        ...

    def obter(self, usuario_id: UUID, id: UUID) -> Fatura | None: ...

    def compras_da_fatura(self, usuario_id: UUID, fatura_id: UUID) -> list[CompraDoCartao]:
        """Da mais antiga para a mais recente."""
        ...

    def compras_da_conta(self, conta_id: UUID) -> list[CompraDoCartao]:
        """Compras e estornos do cartão, sem pagamento de fatura nem transferência própria."""
        ...

    def pagamentos_da_conta(self, conta_id: UUID) -> list[PagamentoDeFatura]:
        """Pagamentos vistos nas transações ``PAGAMENTO_FATURA`` da conta (para a estimativa)."""
        ...

    def vincular_compra(self, compra_id: UUID, fatura_id: UUID | None) -> None: ...


class RepositorioDeCoberturas(Protocol):
    def listar_por_resgates(
        self, usuario_id: UUID, movimento_ids: list[UUID]
    ) -> list[CoberturaDeCompra]: ...

    def adicionar(self, cobertura: CoberturaDeCompra) -> None: ...
    def obter(self, usuario_id: UUID, id: UUID) -> CoberturaDeCompra | None: ...
    def remover(self, id: UUID) -> None: ...
    def remover_dos_gastos(self, gasto_ids: list[UUID]) -> None: ...
    def somar_do_gasto(self, gasto_id: UUID) -> Dinheiro: ...
    def tags_do_gasto(self, gasto_id: UUID) -> frozenset[Tag]: ...
    def listar_dos_gastos(self, gasto_ids: list[UUID]) -> dict[UUID, list[CoberturaDeCompra]]: ...
    def somar_coberto_por_tag(
        self, usuario_id: UUID, categoria: CategoriaDoGasto
    ) -> dict[Tag, Dinheiro]:
        """Em principal: o ``principal`` da cobertura, ou o próprio valor quando nulo."""
        ...

    def usado_do_resgate(self, movimento_id: UUID, tag: Tag) -> Dinheiro:
        """Dinheiro das coberturas que já usam este resgate para esta tag."""
        ...

    def usado_dos_resgates(self, movimento_ids: Sequence[UUID]) -> dict[UUID, dict[Tag, Dinheiro]]:
        """Por resgate e tag, o dinheiro que compras já usaram."""
        ...

    def resgate_em_uso(self, movimento_ids: Sequence[UUID]) -> bool:
        """Verdadeiro se alguma cobertura usa algum destes resgates."""
        ...

    def somar_adicional_por_categoria(
        self, usuario_id: UUID, inicio: date, fim: date
    ) -> dict[CategoriaDoGasto, dict[Tag, Dinheiro]]:
        """Dinheiro das coberturas pagas por resgate real nos gastos do período, por categoria."""
        ...


class RepositorioDeGanhos(Protocol):
    def da_transacao(self, usuario_id: UUID, transacao_id: UUID) -> list[Ganho]:
        """Lançamentos vinculados à transação, somente de contas da pessoa."""
        ...

    def existe_correspondente_sem_vinculo(
        self, usuario_id: UUID, conta_id: UUID, data: date, valor: Dinheiro, descricao: str
    ) -> bool: ...

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
    def reservar_reversao(
        self, transacao_id: UUID, estado_anterior: EstadoDaTransacaoImportada, reversoes: int
    ) -> bool: ...

    def contar_reversoes(self, transacao_id: UUID) -> int: ...

    def registrar_reversao(self, reversao: ReversaoDeClassificacao) -> None: ...

    def abatimentos_da_transacao(self, usuario_id: UUID, transacao_id: UUID) -> list[dict]: ...

    def aceitas_correspondentes_sem_vinculo(
        self,
        usuario_id: UUID,
        conta_id: UUID,
        data: date,
        valor: Dinheiro,
        descricao: str,
        sentido: SentidoDaTransacao,
    ) -> list[TransacaoImportada]: ...

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


class RepositorioDeInvestimentos(Protocol):
    def definir_referencia_da_caixinha(self, referencia: ReferenciaMensalDaCaixinha) -> None: ...
    def referencia_da_caixinha(
        self, investimento_id: UUID, mes: Mes
    ) -> ReferenciaMensalDaCaixinha | None: ...

    def existe_algum(self, usuario_id: UUID) -> bool: ...

    def salvar_posicao(
        self, usuario_id: UUID, investimento: InvestimentoExterno, hoje: date | None = None
    ) -> None:
        """Grava a posição do usuário ou atualiza a de mesmo ``id_externo`` (idempotente).

        Com ``hoje``, registra também o saldo desse dia no histórico (um por investimento e dia).
        """
        ...

    def listar_posicoes(self, usuario_id: UUID) -> list[Investimento]:
        """As posições do usuário com identidade própria, por nome e id externo."""
        ...

    def obter(self, usuario_id: UUID, id: UUID) -> Investimento | None:
        """A posição do usuário; ``None`` se não existe ou é de outro usuário."""
        ...

    def historico(self, usuario_id: UUID, inicio: date, fim: date) -> list[PontoDoHistorico]:
        """Os saldos registrados no período (inclusivo), por data e investimento."""
        ...

    def saldo_antes_de(self, usuario_id: UUID, id: UUID, data: date) -> Dinheiro | None:
        """O saldo do último ponto do histórico com data estritamente anterior a ``data``.

        ``None`` se não há ponto anterior ou o investimento não é do usuário.
        """
        ...

    def listar(self, usuario_id: UUID) -> list[InvestimentoExterno]:
        """As posições do usuário, por nome e, no empate, por id externo."""
        ...


class RepositorioDeMovimentosDeInvestimento(Protocol):
    def listar_relacionados(
        self, usuario_id: UUID, ids: list[UUID]
    ) -> list[MovimentoDeInvestimento]: ...

    def existe_algum(self, usuario_id: UUID) -> bool: ...

    def da_transacao(self, usuario_id: UUID, transacao_id: UUID) -> list[MovimentoDeInvestimento]:
        """Lançamentos vinculados à transação, somente de contas da pessoa."""
        ...

    def contar_correspondentes_sem_vinculo(
        self,
        usuario_id: UUID,
        conta_id: UUID,
        data: date,
        valor: Dinheiro,
        descricao: str,
        tipo: TipoDeMovimento,
    ) -> int: ...

    def adicionar(self, movimento: MovimentoDeInvestimento) -> None: ...

    def somar_aportes_por_categoria(
        self, usuario_id: UUID, inicio: date, fim: date
    ) -> dict[CategoriaDoGasto, Dinheiro]: ...

    def listar_pendentes_de_revisao(self, usuario_id: UUID) -> list[MovimentoDeInvestimento]: ...

    def listar_resgates_sem_destinacao(self, usuario_id: UUID) -> list[MovimentoDeInvestimento]:
        """Resgates da pessoa sem nenhuma destinação (sem tag), do mais recente ao mais antigo."""
        ...

    def gravar_natureza_do_resgate(self, movimento: MovimentoDeInvestimento) -> None: ...

    def gravar_revisao(self, movimento: MovimentoDeInvestimento) -> None: ...

    def somar_aportes(self, usuario_id: UUID, inicio: date, fim: date) -> Dinheiro:
        """Soma dos aportes (não dos resgates) com ``data`` no período, em todas as contas."""
        ...

    def obter(self, usuario_id: UUID, id: UUID) -> MovimentoDeInvestimento | None: ...

    def listar(self, usuario_id: UUID, inicio: date, fim: date) -> list[MovimentoDeInvestimento]:
        """Os movimentos com ``data`` no período (inclusivo), do mais recente para o mais antigo."""
        ...

    def associar(self, id: UUID, investimento_id: UUID) -> None: ...

    def excluir(self, id: UUID) -> None:
        """Apaga o movimento e as partes das suas destinações."""
        ...

    def investimentos_com_movimento(self, usuario_id: UUID) -> set[UUID]:
        """Os investimentos do usuário que já têm algum movimento (aporte ou resgate) associado."""
        ...

    def saldos_iniciais_do_investimento(
        self, usuario_id: UUID, investimento_id: UUID
    ) -> list[MovimentoDeInvestimento]:
        """Os aportes de saldo inicial do investimento, do mais antigo ao mais recente."""
        ...


class RepositorioDeDestinacoes(Protocol):
    def somar_reservado_por_tag(
        self, usuario_id: UUID, categoria: CategoriaDoGasto
    ) -> dict[Tag, Dinheiro]: ...

    def somar_partes_por_categoria(
        self, usuario_id: UUID, inicio: date, fim: date
    ) -> dict[CategoriaDoGasto, Dinheiro]:
        """Partes de aporte com categoria (foto do vínculo), pela data do aporte no período."""
        ...

    def categorias_das_partes(
        self, movimento_ids: Sequence[UUID]
    ) -> dict[UUID, dict[Tag, CategoriaDoGasto]]:
        """Por movimento, a categoria guardada em cada parte (só as que têm)."""
        ...

    def resgate_da_tag(self, movimento_id: UUID, tag: Tag) -> tuple[Dinheiro, Dinheiro] | None:
        """(dinheiro, principal abatido) que o resgate tirou da tag, em valores positivos."""
        ...

    def adicionar(
        self,
        movimento_id: UUID,
        partes: Sequence[ParteDeDestinacao],
    ) -> None:
        """Grava as partes do movimento; o sinal é do chamador (negativo no resgate).

        O investimento da destinação é o do movimento, que precisa tê-lo definido."""
        ...

    def do_movimento(self, movimento_ids: Sequence[UUID]) -> dict[UUID, list[tuple[Tag, Dinheiro]]]:
        """As partes gravadas de cada movimento, ordenadas por tag."""
        ...

    def remover_do_movimento(self, movimento_id: UUID) -> None:
        """Apaga as partes do movimento (o movimento e a posição ficam)."""
        ...

    def principais(self, usuario_id: UUID) -> dict[UUID, dict[Tag, Dinheiro]]:
        """Por investimento do usuário, o principal de cada tag: aportes menos resgates,
        menos o que saiu e mais o que entrou por realocação."""
        ...

    def adicionar_realocacao(self, realocacao: Realocacao) -> None: ...

    def listar_realocacoes(self, usuario_id: UUID, investimento_id: UUID) -> list[Realocacao]:
        """Da mais recente para a mais antiga."""
        ...

    def excluir_realocacao(self, realocacao_id: UUID) -> None: ...

    def listar_realocacoes_no_periodo(
        self, usuario_id: UUID, inicio: date, fim: date
    ) -> list[Realocacao]:
        """As realocações legadas da pessoa com data entre ``inicio`` e ``fim`` (inclusivas)."""
        ...


class RepositorioDeDestinacoesCadastradas(Protocol):
    def bloquear(self, usuario_id: UUID) -> None: ...

    def listar(self, usuario_id: UUID) -> list[DestinacaoCadastrada]: ...

    def obter(self, usuario_id: UUID, id: UUID) -> DestinacaoCadastrada | None: ...

    def obter_por_nome(self, usuario_id: UUID, nome: Tag) -> DestinacaoCadastrada | None: ...

    def adicionar(self, destinacao: DestinacaoCadastrada) -> None: ...

    def definir_icone(self, usuario_id: UUID, id: UUID, icone: IconeDaCaixinha | None) -> None: ...

    def tem_referencias(self, usuario_id: UUID, destinacao: DestinacaoCadastrada) -> bool: ...

    def remover(self, usuario_id: UUID, id: UUID) -> None: ...


class RepositorioDeRecorrencias(Protocol):
    def listar_da_categoria_legada(self, usuario_id: UUID) -> list[Recorrencia]: ...
    def alterar_categoria(self, id: UUID, categoria: CategoriaDoGasto) -> None: ...

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


class RepositorioDeRendaBase(Protocol):
    def obter(self, usuario_id: UUID) -> Dinheiro | None: ...

    def definir(self, usuario_id: UUID, valor: Dinheiro) -> None:
        """Insere ou atualiza a base única da pessoa."""
        ...

    def remover(self, usuario_id: UUID) -> None:
        """Remove a base, sem erro quando já não existe."""
        ...


class RepositorioDeAparencias(Protocol):
    def obter(self, usuario_id: UUID) -> Aparencia | None:
        """A aparência salva da pessoa; ``None`` quando ela nunca personalizou."""
        ...

    def salvar(self, usuario_id: UUID, aparencia: Aparencia) -> None:
        """Insere ou substitui a aparência única da pessoa."""
        ...

    def remover(self, usuario_id: UUID) -> None:
        """Remove a aparência, sem erro quando já não existe."""
        ...


class RepositorioDeGuardadoNasMetas(Protocol):
    def obter(self, usuario_id: UUID) -> GuardadoNasMetas:
        """Sem configuração: desligado e sem marcações. Só devolve marcações de destinações que
        ainda existem no cadastro da pessoa."""
        ...

    def salvar(self, usuario_id: UUID, guardado: GuardadoNasMetas) -> None:
        """Troca o conjunto inteiro; as tags precisam existir no cadastro da pessoa."""
        ...

    def tags_cadastradas(self, usuario_id: UUID) -> set[Tag]:
        """As destinações (caixinhas) cadastradas da pessoa."""
        ...


class RepositorioDeHistoricoDeMetas(Protocol):
    def registrar(self, registro: HistoricoDeMeta) -> None: ...
    def listar(self, usuario_id: UUID, limite: int = 100) -> list[HistoricoDeMeta]: ...


class RepositorioDeMetas(Protocol):
    def bloquear(self, usuario_id: UUID) -> None:
        """Serializa alterações de metas antes de ler os percentuais."""
        ...

    def obter(self, usuario_id: UUID, categoria: AlvoDaMeta) -> Meta | None: ...

    def listar(self, usuario_id: UUID) -> list[Meta]:
        """Metas do usuário, na ordem do enum ``AlvoDaMeta``."""
        ...

    def salvar(self, meta: Meta) -> None:
        """Cria a meta ou troca o percentual da que o usuário já tem para a categoria."""
        ...

    def remover(self, usuario_id: UUID, categoria: AlvoDaMeta) -> None:
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


class RepositorioDeTransferencias(Protocol):
    def obter(
        self, usuario_id: UUID, transferencia_id: UUID
    ) -> TransferenciaEntreContas | None: ...
    def da_transacao(
        self, usuario_id: UUID, transacao_id: UUID
    ) -> TransferenciaEntreContas | None: ...
    def listar(
        self, usuario_id: UUID, inicio: date, fim: date
    ) -> list[TransferenciaEntreContas]: ...
    def salvar(self, transferencia: TransferenciaEntreContas) -> None: ...


class RepositorioDeReaplicacoesDeResgates(Protocol):
    def bloquear(self, usuario_id: UUID) -> None: ...
    def listar(self, usuario_id: UUID) -> list[ReaplicacaoDeResgate]: ...
    def obter(self, usuario_id: UUID, id: UUID) -> ReaplicacaoDeResgate | None: ...
    def para_movimento(
        self, usuario_id: UUID, movimento_id: UUID
    ) -> ReaplicacaoDeResgate | None: ...
    def adicionar(self, reaplicacao: ReaplicacaoDeResgate) -> None: ...
    def remover(self, id: UUID) -> None: ...
    def somar_no_periodo(self, usuario_id: UUID, inicio: date, fim: date) -> Dinheiro: ...


class RepositorioDeOperacoes(Protocol):
    """Operações das posições; o dono é o do investimento (``investimentos.usuario_id``)."""

    def garantir_posicao(self, usuario_id: UUID, investimento_id: UUID) -> bool:
        """Cria a posição do investimento se faltar; ``False`` se não é da pessoa."""
        ...

    def adicionar(self, usuario_id: UUID, operacao: Operacao) -> bool:
        """``False`` (sem duplicar) se a posição já tem a operação com o mesmo ``id_externo``."""
        ...

    def obter(self, usuario_id: UUID, operacao_id: UUID) -> Operacao | None: ...

    def listar_da_posicao(self, usuario_id: UUID, posicao_id: UUID) -> list[Operacao]: ...

    def definir_observacao(
        self,
        usuario_id: UUID,
        investimento_id: UUID,
        quantidade: Decimal | None,
        valor_de_mercado: Dinheiro | None,
        atualizada_em: datetime | None,
    ) -> None:
        """Grava o que a corretora observa na posição (cria a posição se faltar)."""
        ...

    def atualizar(self, usuario_id: UUID, operacao: Operacao) -> None: ...

    def remover(self, usuario_id: UUID, operacao_id: UUID) -> None: ...


class RepositorioDeTratamentos(Protocol):
    """Tratamentos lógicos de aportes sem investimento; o dono é o da conta do movimento."""

    def adicionar(self, usuario_id: UUID, tratamento: TratamentoDeAporte) -> None: ...

    def obter(self, usuario_id: UUID, tratamento_id: UUID) -> TratamentoDeAporte | None: ...

    def ativo_do_movimento(
        self, usuario_id: UUID, movimento_id: UUID
    ) -> TratamentoDeAporte | None: ...

    def listar(self, usuario_id: UUID) -> list[TratamentoDeAporte]: ...

    def atualizar(self, usuario_id: UUID, tratamento: TratamentoDeAporte) -> None: ...


class RepositorioDeAlocacoes(Protocol):
    def ids_das_tags(self, usuario_id: UUID) -> dict[Tag, UUID]:
        """Destinações cadastradas da pessoa, por tag."""
        ...

    def listar_da_posicao(self, usuario_id: UUID, posicao_id: UUID) -> list[AlocacaoDeCaixinha]: ...

    def substituir(
        self, usuario_id: UUID, posicao_id: UUID, alocacoes: list[AlocacaoDeCaixinha]
    ) -> None: ...


class RepositorioDeMudancasDeFracao(Protocol):
    """Mudanças datadas da fração das caixinhas (alocação da parte sem caixinha e realocação),
    sempre filtradas pelo dono da posição."""

    def adicionar(self, usuario_id: UUID, mudanca: MudancaDeFracao) -> None: ...

    def listar_no_periodo(self, usuario_id: UUID, inicio: date, fim: date) -> list[MudancaDeFracao]:
        """Com data entre ``inicio`` e ``fim`` (inclusivas), da mais antiga para a mais recente."""
        ...

    def listar_da_posicao(self, usuario_id: UUID, posicao_id: UUID) -> list[MudancaDeFracao]:
        """Da mais recente para a mais antiga."""
        ...

    def obter(self, usuario_id: UUID, id: UUID) -> MudancaDeFracao | None: ...

    def excluir(self, usuario_id: UUID, id: UUID) -> None: ...


class RepositorioDeCasamentos(Protocol):
    def adicionar(self, usuario_id: UUID, casamento: CasamentoDeOperacao) -> None: ...

    def obter(self, usuario_id: UUID, casamento_id: UUID) -> CasamentoDeOperacao | None: ...

    def para_operacao(self, usuario_id: UUID, operacao_id: UUID) -> CasamentoDeOperacao | None: ...

    def listar(self, usuario_id: UUID) -> list[CasamentoDeOperacao]:
        """Todos os casamentos da pessoa, numa só consulta, por id."""
        ...

    def transacoes_casadas(self, usuario_id: UUID) -> set[UUID]:
        """Ids das transações importadas que estão em algum casamento da pessoa."""
        ...

    def remover(self, usuario_id: UUID, casamento_id: UUID) -> None: ...


@dataclass(frozen=True, slots=True)
class OperacaoExterna:
    """Operação de investimento como chega da corretora (Pluggy), antes de virar ``Operacao``."""

    id_externo: str
    # O tipo como a Pluggy escreve (``BUY``, ``SELL``, ``INTEREST``, ``TRANSFER``...).
    tipo: str
    data: date
    # ``None`` quando a corretora não informa a quantidade (acontece em compras reais).
    quantidade: str | None
    valor_bruto: Dinheiro
    # Soma das despesas informadas na própria operação (corretagem, emolumentos, IRRF, IOF...);
    # ``None`` se a corretora não informa nenhuma.
    custos: Dinheiro | None = None
    # ``CREDIT`` ou ``DEBIT``, como a Pluggy informa.
    sentido: str | None = None
    data_do_pregao: date | None = None


class UnidadeDeTrabalho(Protocol):
    reaplicacoes_de_resgates: RepositorioDeReaplicacoesDeResgates
    transferencias: RepositorioDeTransferencias
    operacoes: RepositorioDeOperacoes
    tratamentos: RepositorioDeTratamentos
    alocacoes: RepositorioDeAlocacoes
    mudancas_de_fracao: RepositorioDeMudancasDeFracao
    casamentos: RepositorioDeCasamentos

    """Entrega os repositórios e controla a transação; usada em ``with`` sequenciais."""

    coberturas: RepositorioDeCoberturas
    faturas: RepositorioDeFaturas
    cores_das_destinacoes: RepositorioDeCoresDasDestinacoes

    usuarios: RepositorioDeUsuarios
    contas: RepositorioDeContas
    gastos: RepositorioDeGastos
    ganhos: RepositorioDeGanhos
    transacoes_importadas: RepositorioDeTransacoesImportadas
    investimentos: RepositorioDeInvestimentos
    movimentos_de_investimento: RepositorioDeMovimentosDeInvestimento
    destinacoes: RepositorioDeDestinacoes
    destinacoes_cadastradas: RepositorioDeDestinacoesCadastradas
    recorrencias: RepositorioDeRecorrencias
    historico_de_metas: RepositorioDeHistoricoDeMetas
    metas: RepositorioDeMetas
    renda_base: RepositorioDeRendaBase
    aparencias: RepositorioDeAparencias
    guardado_nas_metas: RepositorioDeGuardadoNasMetas
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
    # Só no cartão: o fechamento e o vencimento da fatura em curso, se o banco informa.
    fechamento: date | None = None
    vencimento: date | None = None
    # Só os quatro últimos dígitos do número da conta, se o banco o informa.
    final_do_numero: str | None = None


@dataclass(frozen=True, slots=True)
class InvestimentoExterno:
    """Posição de investimento como chega de um provedor de Open Finance.

    Não é uma conta: não entra em saldo, "Pode gastar" nem metas. ``dados`` é o registro inteiro
    do provedor em JSON (decimais como texto), para que nenhum campo seja perdido na entrada.
    """

    id_externo: str
    nome: str
    tipo: str
    subtipo: str | None
    saldo: Dinheiro
    dados: str
    # O que a instituição informa (a Pluggy: ``amountOriginal`` e ``amountProfit``), se informar.
    valor_aplicado: Dinheiro | None = None
    rendimento: Dinheiro | None = None

    conta_remunerada_id: UUID | None = None


@dataclass(frozen=True, slots=True)
class TransacaoExterna:
    """Transação bancária lançada (já postada) como chega de um provedor de Open Finance."""

    id_externo: str
    valor: Dinheiro
    descricao: str
    data: date
    sentido: SentidoDaTransacao
    tipo_de_operacao: str | None = None
    id_da_fatura: str | None = None
    parcela_numero: int | None = None
    parcela_total: int | None = None


class ProvedorOpenFinance(Protocol):
    """Fonte externa de contas e transações bancárias (ex.: Pluggy).

    Falhas do provedor (rede, credencial, resposta inesperada) viram ``ProvedorIndisponivel``.
    """

    def listar_contas(self, id_do_item: str) -> list[ContaExterna]: ...

    def listar_investimentos(self, id_do_item: str) -> list[InvestimentoExterno]: ...

    def listar_transacoes(self, id_da_conta: str, desde: date) -> list[TransacaoExterna]:
        """Transações lançadas (sem as pendentes) a partir de ``desde``, inclusive."""
        ...

    def listar_faturas(self, id_da_conta: str) -> list[FaturaExterna]:
        """Faturas do cartão; ``[]`` se a conta não tem faturas."""
        ...

    def listar_operacoes_do_investimento(self, id_do_investimento: str) -> list[OperacaoExterna]:
        """Operações (compras, vendas...) de uma posição; ``[]`` se a corretora não informa."""
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
