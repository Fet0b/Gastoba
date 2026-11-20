class ErroDeDominio(Exception):
    """Base de todas as exceções de regra de negócio do Gastoba."""


class ValorInvalido(ErroDeDominio):
    """Valor monetário fora das regras (negativo, zero, casas decimais demais)."""


class DescricaoInvalida(ErroDeDominio):
    """Descrição de gasto vazia, só com espaços ou com mais de 200 caracteres."""


class NomeInvalido(ErroDeDominio):
    """Nome de usuário ou de conta vazio, só com espaços ou longo demais."""


class TagInvalida(ErroDeDominio):
    """Tag vazia, longa demais ou com caracteres não imprimíveis, ou gasto com tags demais."""


class DestinacaoCadastradaNaoEncontrada(ErroDeDominio):
    """Caixinha inexistente ou pertencente a outra pessoa."""


class IconeInvalido(ErroDeDominio):
    """Código de ícone de caixinha fora da lista fechada."""


class DestinacaoJaCadastrada(ErroDeDominio):
    """A pessoa já tem uma caixinha com esse nome."""


class DestinacaoEmUso(ErroDeDominio):
    """A caixinha tem saldo derivado ou referência/histórico e não pode ser excluída."""


class PeriodoInvalido(ErroDeDominio):
    """Período com a data inicial depois da data final."""


class ContaNaoEncontrada(ErroDeDominio):
    """Conta inexistente ou pertencente a outro usuário."""


class ContaImportada(ErroDeDominio):
    """Conta importada do banco não pode ser excluída: ela segue o que vem do provedor."""


class ContaJaExiste(ErroDeDominio):
    """Já existe uma conta com o mesmo nome para o mesmo usuário."""


class ApelidoInvalido(ErroDeDominio):
    """Apelido da conta vazio, longo demais ou com caracteres não imprimíveis."""


class ApelidoJaExiste(ErroDeDominio):
    """Outra conta da mesma pessoa já usa esse apelido."""


class EmailInvalido(ErroDeDominio):
    """E-mail sem exatamente um ``@``, com espaços ou fora de 3 a 254 caracteres."""


class SenhaInvalida(ErroDeDominio):
    """Senha fora da política (10 a 128 caracteres)."""


class NomeDeChaveInvalido(ErroDeDominio):
    """Nome de chave de API vazio, só com espaços ou com mais de 60 caracteres."""


class ExpiracaoInvalida(ErroDeDominio):
    """Expiração de sessão ou de chave de API que não fica depois da criação."""


class EmailJaCadastrado(ErroDeDominio):
    """Já existe um usuário com o mesmo e-mail."""


class CadastroFechado(ErroDeDominio):
    """O cadastro pela API está desligado nesta instalação."""


class ChaveDeApiNaoEncontrada(ErroDeDominio):
    """Chave de API inexistente, já revogada ou pertencente a outro usuário."""


class CredenciaisInvalidas(ErroDeDominio):
    """E-mail ou senha errados; a mensagem é a mesma nos dois casos, para não revelar qual."""

    def __init__(self) -> None:
        super().__init__("E-mail ou senha incorretos.")


class NaoAutenticado(ErroDeDominio):
    """Credencial ausente, malformada, desconhecida, expirada ou revogada; mensagem única."""

    def __init__(self) -> None:
        super().__init__("Credencial ausente, inválida ou expirada.")


class AcessoNegado(ErroDeDominio):
    """A credencial é válida, mas não dá acesso à operação (ex.: escopo insuficiente)."""


class MuitasTentativas(ErroDeDominio):
    """Tentativas de entrar demais em pouco tempo; diz em quantos segundos tentar de novo."""

    def __init__(self, segundos_para_tentar_de_novo: int) -> None:
        super().__init__("Muitas tentativas de entrar. Tente de novo mais tarde.")
        self.segundos_para_tentar_de_novo = max(1, segundos_para_tentar_de_novo)


class UsuarioPadraoJaAssumido(ErroDeDominio):
    """O usuário padrão herdado já tem e-mail ou senha: seus dados já foram assumidos."""

    def __init__(self) -> None:
        super().__init__("O usuário padrão já tem e-mail e senha.")


class GanhoNaoEncontrado(ErroDeDominio):
    """Ganho inexistente ou pertencente a outro usuário."""


class GanhoDeRecorrencia(ErroDeDominio):
    """Ganho gerado por uma recorrência: quem o recria é a própria recorrência."""


class ImportacaoDesligada(ErroDeDominio):
    """A importação bancária não está configurada ou a pessoa não é a dona dela."""


class TransacaoImportadaNaoEncontrada(ErroDeDominio):
    """Transação importada inexistente ou de outro usuário."""


class TransacaoJaTratada(ErroDeDominio):
    """A transação importada já foi aceita ou ignorada."""


class TransacaoImportadaInvalida(ErroDeDominio):
    """Dados que faltam ou sobram para aceitar a transação importada (ex.: categoria)."""


class SincronizacaoEmAndamento(ErroDeDominio):
    """Já há uma sincronização bancária rodando."""


class ProvedorIndisponivel(ErroDeDominio):
    """O provedor de Open Finance falhou (rede, credencial ou resposta inesperada).

    ``motivo`` é um texto curto e seguro para log (etapa e status, nunca dados nem ids).
    """

    def __init__(self, mensagem: str, motivo: str = "") -> None:
        super().__init__(mensagem)
        self.motivo = motivo


class RecorrenciaNaoEncontrada(ErroDeDominio):
    """Recorrência inexistente ou pertencente a outro usuário."""


class RecorrenciaInvalida(ErroDeDominio):
    """Recorrência fora das regras (dia, categoria, período, limite de recorrências ativas)."""


class MetaNaoEncontrada(ErroDeDominio):
    """O usuário não tem meta para a categoria."""


class PercentualInvalido(ErroDeDominio):
    """Percentual de meta fora de 1 a 100."""


class PercentuaisExcedem100(ErroDeDominio):
    """A soma dos percentuais das metas do usuário passaria de 100%."""


class MesInvalido(ErroDeDominio):
    """Mês fora do formato AAAA-MM (mês de 01 a 12, ano de 0001 a 9999)."""


class DestinacaoInvalida(ErroDeDominio):
    """Destinações de um aporte fora das regras (percentual, soma fora de 100, tag repetida)."""


class InvestimentoNaoEncontrado(ErroDeDominio):
    """Investimento inexistente ou de outro usuário."""


class MovimentoDeInvestimentoNaoEncontrado(ErroDeDominio):
    """Aporte ou resgate inexistente ou de outro usuário."""


class MovimentoJaAssociado(ErroDeDominio):
    """O aporte ou resgate já está associado a um investimento."""


class PrincipalInsuficiente(ErroDeDominio):
    """Resgate ou realocação maior que o principal da destinação."""


class ResgateMaiorQueOValorDaDestinacao(ErroDeDominio):
    """A parte do resgate passa do valor que a destinação tinha antes dele."""


class RealocacaoNaoEncontrada(ErroDeDominio):
    """Realocação inexistente, de outro investimento ou de outro usuário."""


class MovimentoNaoDesfazivel(ErroDeDominio):
    """O movimento não cumpre as condições para desfazer com segurança."""


class SemValorADestinar(ErroDeDominio):
    """A posição já tem principal registrado para todo o valor aplicado (ou o saldo)."""


class CategoriaInvalida(ErroDeDominio):
    """A categoria não vale para esta operação (ex.: ``investimentos`` num gasto)."""


class DivisaoInvalida(ErroDeDominio):
    """Divisão de uma transação fora das regras (partes, percentuais, soma, categoria)."""


class DivisaoExigeConfirmacao(ErroDeDominio):
    """Desfazer todas as partes da transação dividida exige confirmação explícita."""


class RevisaoNaoPendente(ErroDeDominio):
    pass


class CoberturaInvalida(ErroDeDominio):
    pass


class CoberturaJaExiste(ErroDeDominio):
    pass


class CoberturaNaoEncontrada(ErroDeDominio):
    pass


class GastoNaoEncontrado(ErroDeDominio):
    pass


class RecorrenciaEmRevisao(ErroDeDominio):
    pass


class FaturaNaoEncontrada(ErroDeDominio):
    """Fatura inexistente ou de uma conta de outro usuário."""


class MovimentoIncompativelComInvestimento(ErroDeDominio):
    """O movimento não pode virar aporte, ou não pode ser ligado ao investimento escolhido
    (imposto e taxa não são dinheiro investido; conta remunerada não é ação nem título)."""


class ReaplicacaoInvalida(ErroDeDominio):
    pass


class ReaplicacaoJaExiste(ErroDeDominio):
    pass


class ReaplicacaoNaoEncontrada(ErroDeDominio):
    pass


class OperacaoNaoEncontrada(ErroDeDominio):
    pass


class OperacaoDaCorretoraImutavel(ErroDeDominio):
    pass


class OperacaoInvalida(ErroDeDominio):
    pass


class TransacaoCasada(ErroDeDominio):
    """A transação está ligada a uma operação da corretora: desfaça a ligação antes."""


class RevisaoDesatualizada(ErroDeDominio):
    """A proposta mudou desde que a pessoa a leu: leia de novo antes de confirmar."""


class CasamentoAmbiguo(ErroDeDominio):
    pass


class CasamentoJaExiste(ErroDeDominio):
    pass


class MigracaoInconsistente(ErroDeDominio):
    pass


class CasamentoNaoEncontrado(ErroDeDominio):
    pass


class OperacaoPossivelmenteDuplicada(ErroDeDominio):
    pass


class AporteJaTratado(ErroDeDominio):
    pass


class MesclaInvalida(ErroDeDominio):
    pass


class TratamentoNaoEncontrado(ErroDeDominio):
    pass


class AparenciaInvalida(ErroDeDominio):
    """Matiz fora do espectro, ou nome do app vazio, longo demais ou não imprimível."""


class GuardadoInvalido(ErroDeDominio):
    """Marcação do guardado nas metas fora das regras (tag repetida, inexistente, demais)."""
