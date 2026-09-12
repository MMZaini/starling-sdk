"""Local mTLS server with short-lived certificates, shared by both SDK test suites."""

from __future__ import annotations

import ipaddress
import json
import ssl
import sys
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import parse_qs

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID


@contextmanager
def tls_server():
    with TemporaryDirectory(prefix="starling-test-tls-") as directory:
        root = Path(directory)
        now = datetime.now(timezone.utc)
        ca_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "SDK test CA")])
        ca = (x509.CertificateBuilder().subject_name(ca_name).issuer_name(ca_name)
              .public_key(ca_key.public_key()).serial_number(x509.random_serial_number())
              .not_valid_before(now - timedelta(minutes=1)).not_valid_after(now + timedelta(hours=1))
              .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
              .add_extension(x509.KeyUsage(digital_signature=True, content_commitment=False, key_encipherment=False,
                                           data_encipherment=False, key_agreement=False, key_cert_sign=True,
                                           crl_sign=True, encipher_only=False, decipher_only=False), critical=True)
              .add_extension(x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()), critical=False)
              .sign(ca_key, hashes.SHA256()))
        (root / "ca.pem").write_bytes(ca.public_bytes(serialization.Encoding.PEM))
        for name, purpose in [("server", ExtendedKeyUsageOID.SERVER_AUTH), ("client", ExtendedKeyUsageOID.CLIENT_AUTH)]:
            key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
            cert = (x509.CertificateBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, name)]))
                    .issuer_name(ca_name).public_key(key.public_key()).serial_number(x509.random_serial_number())
                    .not_valid_before(now - timedelta(minutes=1)).not_valid_after(now + timedelta(hours=1))
                    .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
                    .add_extension(x509.ExtendedKeyUsage([purpose]), critical=False)
                    .add_extension(x509.SubjectAlternativeName([x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]), critical=False)
                    .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False)
                    .sign(ca_key, hashes.SHA256()))
            (root / f"{name}.pem").write_bytes(cert.public_bytes(serialization.Encoding.PEM))
            (root / f"{name}-key.pem").write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                form = parse_qs(self.rfile.read(int(self.headers["Content-Length"])).decode())
                if self.path != "/oauth/access-token" or not self.connection.getpeercert() or form.get("client_secret") != ["secret&=+"]:
                    self.send_error(400)
                    return
                data = json.dumps(dict(access_token="access-new", refresh_token="refresh-new", token_type="Bearer", expires_in=3600)).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(root / "server.pem", root / "server-key.pem")
        context.load_verify_locations(root / "ca.pem")
        context.verify_mode = ssl.CERT_REQUIRED
        server.socket = context.wrap_socket(server.socket, server_side=True)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield dict(url=f"https://127.0.0.1:{server.server_port}/oauth/access-token", ca=str(root / "ca.pem"), cert=str(root / "client.pem"), key=str(root / "client-key.pem"))
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == "__main__":
    with tls_server() as configuration:
        print(json.dumps(configuration), flush=True)
        sys.stdin.read()
