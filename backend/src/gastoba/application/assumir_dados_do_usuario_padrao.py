from gastoba.domain.email import Email
from gastoba.domain.excecoes import UsuarioPadraoJaAssumido
from gastoba.domain.portas import HasherDeSenha, UnidadeDeTrabalho
from gastoba.domain.senha import SenhaEmClaro
from gastoba.domain.usuario import ID_USUARIO_PADRAO, Usuario


class AssumirDadosDoUsuarioPadrao:
    """Dá e-mail, nome e senha ao usuário padrão herdado, que mantém o id e os dados.

    Usado só pelo comando administrativo (``--assumir-dados-do-padrao``), depois de
    ``ObterUsuarioPadrao`` garantir que o usuário padrão existe.
    """

    def __init__(
        self, unidade_de_trabalho: UnidadeDeTrabalho, hasher_de_senha: HasherDeSenha
    ) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho
        self._hasher_de_senha = hasher_de_senha

    def executar(self, nome: str, email: str, senha: str) -> Usuario:
        # Valida tudo antes do hash, que é caro de propósito.
        email_do_usuario = Email.de_texto(email)
        senha_em_claro = SenhaEmClaro(senha)
        Usuario(nome)
        with self._unidade_de_trabalho as uow:
            padrao = uow.usuarios.obter(ID_USUARIO_PADRAO)
            if padrao is None:
                raise LookupError("O usuário padrão não existe.")
            if padrao.email is not None or padrao.senha_hash is not None:
                raise UsuarioPadraoJaAssumido()
            usuario = Usuario(
                nome,
                id=ID_USUARIO_PADRAO,
                email=email_do_usuario,
                senha_hash=self._hasher_de_senha.hashear(senha_em_claro),
            )
            uow.usuarios.salvar(usuario)
            uow.commit()
            return usuario
