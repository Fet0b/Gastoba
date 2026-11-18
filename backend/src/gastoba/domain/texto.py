import unicodedata


def normalizar_texto(texto: str) -> str:
    """Minúsculas, sem acento nem pontuação, com as palavras separadas por um espaço só.

    A pontuação vira espaço (``"BTG-PACTUAL"`` e ``"BTG PACTUAL"`` ficam iguais).
    """
    sem_acento = "".join(
        c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c)
    )
    so_letras_e_numeros = "".join(c if c.isalnum() else " " for c in sem_acento.casefold())
    return " ".join(so_letras_e_numeros.split())
