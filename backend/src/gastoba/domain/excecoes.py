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


class PeriodoInvalido(ErroDeDominio):
    """Período com a data inicial depois da data final."""


class ContaNaoEncontrada(ErroDeDominio):
    """Conta inexistente ou pertencente a outro usuário."""


class ContaJaExiste(ErroDeDominio):
    """Já existe uma conta com o mesmo nome para o mesmo usuário."""


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
    """O provedor de Open Finance falhou (rede, credencial ou resposta inesperada)."""


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
