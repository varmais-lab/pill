#!/usr/bin/env python3
"""Build the dependency-free prototype from an installed SDK, without Gradle.

Usage: python3 tools/build_apk.py --sdk /path/to/sdk --keystore /private/debug.jks
Only Android SDK platform/build tools and a Java 17+ compiler are required.
The normal Android Studio/Gradle build remains supported separately.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = 'com.varmaislab.tabletreminder'

def run(args):
    subprocess.run([str(arg) for arg in args], cwd=ROOT, check=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--sdk', required=True, type=Path)
    parser.add_argument('--keystore', required=True, type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / 'build' / 'TabletReminder.apk')
    args = parser.parse_args()
    tools = args.sdk / 'build-tools' / '35.0.0'
    android_jar = args.sdk / 'platforms' / 'android-36' / 'android.jar'
    if not android_jar.is_file() or not tools.is_dir():
        raise SystemExit('Install Android SDK Platform 36 and Build-Tools 35.0.0 first.')
    build = ROOT / 'build' / 'standalone'
    if build.exists(): shutil.rmtree(build)
    for name in ['gen', 'classes', 'dex']: (build / name).mkdir(parents=True, exist_ok=True)
    ET.register_namespace('android', 'http://schemas.android.com/apk/res/android')
    manifest = ET.parse(ROOT / 'app/src/main/AndroidManifest.xml')
    manifest.getroot().set('package', PACKAGE)
    manifest.write(build / 'AndroidManifest.xml', encoding='utf-8', xml_declaration=True)
    aapt2 = tools / ('aapt2.exe' if os.name == 'nt' else 'aapt2')
    run([aapt2, 'compile', '--dir', ROOT / 'app/src/main/res', '-o', build / 'resources.zip'])
    run([aapt2, 'link', '-o', build / 'base.apk', '-I', android_jar, '--manifest', build / 'AndroidManifest.xml',
         '--java', build / 'gen', '--min-sdk-version', '26', '--target-sdk-version', '36',
         '--version-code', '2', '--version-name', '0.2.0', '-A', ROOT / 'app/src/main/assets', build / 'resources.zip'])
    sources = list((ROOT / 'app/src/main/java').rglob('*.java')) + list((build / 'gen').rglob('*.java'))
    compiler = [shutil.which('javac')] if shutil.which('javac') else ['java', '-m', 'jdk.compiler/com.sun.tools.javac.Main']
    run(compiler + ['--release', '17', '-encoding', 'UTF-8', '-classpath', android_jar, '-d', build / 'classes'] + sources)
    with zipfile.ZipFile(build / 'classes.jar', 'w', zipfile.ZIP_DEFLATED) as z:
        for p in (build / 'classes').rglob('*.class'): z.write(p, p.relative_to(build / 'classes'))
    run(['java', '-cp', tools / 'lib/d8.jar', 'com.android.tools.r8.D8', '--debug', '--min-api', '26',
         '--lib', android_jar, '--output', build / 'dex', build / 'classes.jar'])
    shutil.copy(build / 'base.apk', build / 'unsigned.apk')
    with zipfile.ZipFile(build / 'unsigned.apk', 'a', zipfile.ZIP_DEFLATED) as z:
        for p in (build / 'dex').glob('*.dex'): z.write(p, p.name)
    align = tools / ('zipalign.exe' if os.name == 'nt' else 'zipalign')
    run([align, '-f', '4', build / 'unsigned.apk', build / 'aligned.apk'])
    args.keystore.parent.mkdir(parents=True, exist_ok=True)
    if not args.keystore.exists():
        run(['keytool', '-genkeypair', '-noprompt', '-keystore', args.keystore, '-storetype', 'JKS',
             '-alias', 'tabletprototype', '-storepass', 'android', '-keypass', 'android',
             '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
             '-dname', 'CN=Tablet Reminder Prototype, O=Varmais Lab, C=IN'])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    run(['java', '-jar', tools / 'lib/apksigner.jar', 'sign', '--ks', args.keystore,
         '--ks-key-alias', 'tabletprototype', '--ks-pass', 'pass:android', '--key-pass', 'pass:android',
         '--min-sdk-version', '26', '--out', args.output, build / 'aligned.apk'])
    run(['java', '-jar', tools / 'lib/apksigner.jar', 'verify', '--verbose', '--print-certs', args.output])
    digest = hashlib.sha256(args.output.read_bytes()).hexdigest()
    print(json.dumps({'apk': str(args.output.resolve()), 'sha256': digest, 'bytes': args.output.stat().st_size}))

if __name__ == '__main__': main()
