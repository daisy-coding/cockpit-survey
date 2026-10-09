"""Файловый протокол анкеты: только данные через stdin, без оболочки."""
import errno
import json
import os
import re
import stat
import sys
import uuid

MAX_BYTES = 256 * 1024
ID = re.compile(r"[a-z0-9][a-z0-9-]{0,63}\Z")
DIRECTORY = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW


class Refused(Exception):
    pass


def folder(root):
    # Каждый компонент открыт относительно уже проверенного дескриптора.
    # Даже подмена каталога ссылкой между проверкой и открытием не ведёт наружу.
    if not isinstance(root, str) or not root.startswith("/"):
        raise Refused("root")
    fd = os.open("/", DIRECTORY)
    try:
        for part in root.split("/")[1:] + [".cockpit", "surveys"]:
            if not part:
                continue
            if part in (".", ".."):
                raise Refused("root")
            next_fd = os.open(part, DIRECTORY, dir_fd=fd)
            os.close(fd)
            fd = next_fd
        return fd
    except BaseException:
        os.close(fd)
        raise


def regular(fd, name, optional=False):
    try:
        info = os.stat(name, dir_fd=fd, follow_symlinks=False)
    except FileNotFoundError:
        if optional:
            return None
        raise
    if stat.S_ISLNK(info.st_mode):
        raise Refused("symlink")
    if not stat.S_ISREG(info.st_mode):
        raise Refused("file")
    return info


def read_file(fd, name, optional=False):
    if regular(fd, name, optional) is None:
        return {"text": None}
    handle = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
    with os.fdopen(handle, "rb") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode):
            raise Refused("file")
        if info.st_size > MAX_BYTES:
            raise Refused("size")
        data = stream.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise Refused("size")
    return {"text": data.decode("utf-8")}


def write_file(fd, name, text):
    if not isinstance(text, str):
        raise Refused("request")
    data = text.encode("utf-8")
    if len(data) > MAX_BYTES:
        raise Refused("size")
    regular(fd, name, optional=True)
    temporary = ".survey-" + uuid.uuid4().hex + ".tmp"
    handle = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=fd)
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        regular(fd, name, optional=True)
        os.replace(temporary, name, src_dir_fd=fd, dst_dir_fd=fd)
        os.fsync(fd)
    finally:
        # Удаляется только собственный временный файл в уже открытом каталоге.
        try:
            os.unlink(temporary, dir_fd=fd)
        except FileNotFoundError:
            pass
    return {"saved": True}


def dispatch(request):
    if not isinstance(request, dict) or request.get("op") not in ("list", "read", "answers", "write"):
        raise Refused("request")
    op = request["op"]
    survey_id = request.get("id")
    if op != "list" and (not isinstance(survey_id, str) or not ID.fullmatch(survey_id)):
        raise Refused("id")
    try:
        fd = folder(request.get("root"))
    except FileNotFoundError:
        if op == "list":
            return {"entries": []}
        raise
    try:
        if op == "list":
            entries = []
            for name in os.listdir(fd):
                if not name.endswith(".json") or not ID.fullmatch(name[:-5]):
                    continue
                info = os.stat(name, dir_fd=fd, follow_symlinks=False)
                if stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode):
                    entries.append({"id": name[:-5], "mtimeMs": info.st_mtime_ns / 1000000, "isLink": stat.S_ISLNK(info.st_mode)})
            return {"entries": entries}
        name = survey_id + (".json" if op == "read" else ".answers.json")
        if op == "write":
            return write_file(fd, name, request.get("text"))
        return read_file(fd, name, optional=op == "answers")
    finally:
        os.close(fd)


def main():
    try:
        raw = sys.stdin.buffer.read(MAX_BYTES * 8 + 1)
        if len(raw) > MAX_BYTES * 8:
            raise Refused("size")
        result = dispatch(json.loads(raw))
    except Refused as error:
        result = {"error": str(error)}
    except OSError as error:
        result = {"error": "symlink" if error.errno in (errno.ELOOP, errno.ENOTDIR) else "missing" if error.errno == errno.ENOENT else "io"}
    except (ValueError, UnicodeError, TypeError):
        result = {"error": "request"}
    except Exception:
        result = {"error": "io"}
    # Исключения и содержимое файлов не попадают в stderr.
    sys.stdout.write(json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    main()
