from gastoba.domain.email import Email
from gastoba.domain.excecoes import CadastroFechado, EmailJaCadastrado
from gastoba.domain.portas import HasherDeSenha, UnidadeDeTrabalho
from gastoba.domain.senha import SenhaEmClaro
from gastoba.domain.usuario import Usuario


class CadastrarUsuario:
    """Auto-cadastro pela API, só quando a instalação o permite (``cadastro_aberto``)."""

    def __init__(
        self,
        unidade_de_trabalho: UnidadeDeTrabalho,
        hasher_de_senha: HasherDeSenha,
        cadastro_aberto: bool,
    ) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho
        self._hasher_de_senha = hasher_de_senha
        self._cadastro_aberto = cadastro_aberto

    def executar(self, nome: str, email: str, senha: str) -> Usuario:
        if not self._cadastro_aberto:
            raise CadastroFechado("O cadastro está fechado nesta instalação.")
        # Valida tudo antes do hash, que é caro de propósito.
        email_do_usuario = Email.de_texto(email)
        senha_em_claro = SenhaEmClaro(senha)
        Usuario(nome)
        with self._unidade_de_trabalho as uow:
            if uow.usuarios.obter_por_email(email_do_usuario) is not None:
                raise EmailJaCadastrado("Já existe um usuário com este e-mail.")
            usuario = Usuario(
                nome,
                email=email_do_usuario,
                senha_hash=self._hasher_de_senha.hashear(senha_em_claro),
            )
            uow.usuarios.salvar(usuario)
            uow.commit()
            return usuario
