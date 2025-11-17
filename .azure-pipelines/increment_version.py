import json
import semver
import sys
import os
from jproperties import Properties
from git import Repo
from lxml import etree
from git_changelog.cli import build_and_render
import subprocess

pathVersion = sys.argv[1]
stage = sys.argv[2]
type = sys.argv[3]
CI_PIPELINE_ID = os.environ.get('CI_PIPELINE_ID')

repo = Repo('.')
last_commit = repo.head.commit
last_commit_message = last_commit.message.lower()
remote = repo.remotes.origin


######## PROPERTIES FUNCTIONS ########
# Carga el archivo properties
def load_Properties (path_properties):
    properties_config = Properties()
    with open(path_properties, 'rb') as f:
        properties_config.load(f, encoding='utf-8')
    return properties_config

# Trae el valor de una key del properties de koni (version,android.versioncode,ios.bundleversion)
def get_keyProperties (path_properties,item):
    configs = load_Properties(path_properties)
    key_properties = configs.get(item).data
    return key_properties

# Guarda los nuevos valores de las versiones en el properties (version,android.versioncode,ios.bundleversion)
def update_keyProperties (path_properties,new_version,new_androidversion=None):
    configs = load_Properties(path_properties)
    configs['version'] = new_version
    if new_androidversion != None:
        configs['android.versioncode'] = str(new_androidversion)
        configs['ios.bundleversion'] = str(new_androidversion)
    with open(path_properties, 'wb') as f:
        configs.store(f, encoding="utf-8")

def incrementBuild (num_build): ### tambien ios
    num_build = num_build + 1
    return num_build

if type == 'npm':
    with open(pathVersion) as file:
        data = json.load(file)
        current_version = data['version']
        version_parts = semver.parse(current_version)
elif type == 'maven':
    tree = etree.parse(pathVersion)
    root = tree.getroot()
    namespace = {'ns': 'http://maven.apache.org/POM/4.0.0'}
    current_version = root.find('ns:version', namespaces=namespace)
    version_parts = semver.parse(current_version.text)
elif type == 'dotnet':
    tree = etree.parse(pathVersion)
    root = tree.getroot()
    current_version = root.find('PropertyGroup/Version')
    version_parts = semver.parse(current_version.text)
    print("Esta es la version", current_version)
elif type == 'koni':
    current_version = get_keyProperties(pathVersion,'version')
    android_version = int(get_keyProperties(pathVersion,'android.versioncode'))
    version_parts =semver.parse(current_version)
elif type == 'automation':
    current_version = get_keyProperties(pathVersion,'version')
    version_app = get_keyProperties(pathVersion,'version_app')
    name_app = get_keyProperties(pathVersion,'name_app')
    version_parts =semver.parse(current_version)
if current_version is None:
    print("Error: No se encontró el elemento de la versión en el archivo")
    sys.exit(1)

version_number = f"{version_parts['major']}.{version_parts['minor']}.{version_parts['patch']}"
build = version_parts['build']

if stage == 'dev':
    prerelease = 'alpha'
elif stage == 'qa':
    prerelease = 'beta'
elif stage == 'staging':
    prerelease = 'rc'
else:
    prerelease = ''

try:
    semver.parse(version_number)
except ValueError:
    print(f"Error: la versión actual '{version_number}' no es válida según SemVer")
    sys.exit(1)

new_version = ''
if stage == 'dev':
    try:
        if '[major]' in last_commit_message:
            new_version = semver.bump_major(version_number)
            if type == 'koni':
                ios_version = 0
                android_version = 0

        elif '[minor]' in last_commit_message:
            new_version = semver.bump_minor(version_number)
            if type == 'koni':
                ios_version = 0
                android_version = 0

        elif '[patch]' in last_commit_message:
            new_version = semver.bump_patch(version_number)
            if type == 'koni':
                ios_version = 0
                android_version = 0
        else:
            print("Esta version no se incrementa")

    except ValueError:
           print(f"Error: acción de incremento inválida")
           sys.exit(1)

new_version_number = semver.parse_version_info(version_number) if new_version == '' else semver.parse_version_info(new_version)

if type == 'npm' or type == 'maven' or type == 'dotnet':
    new_version_format = semver.format_version(
        major=new_version_number.major,
        minor=new_version_number.minor,
        patch=new_version_number.patch,
        prerelease=prerelease,
        build=CI_PIPELINE_ID
    )

    formatted_version = semver.format_version(
        major=new_version_number.major,
        minor=new_version_number.minor,
        patch=new_version_number.patch,
        build=CI_PIPELINE_ID
    )
if type == 'koni':
    new_android_version = incrementBuild(android_version)

    formatted_version = semver.format_version(
        major=new_version_number.major,
        minor=new_version_number.minor,
        patch=new_version_number.patch,
        build=str(new_android_version)
    )

    new_version_format = semver.format_version(
        major=new_version_number.major,
        minor=new_version_number.minor,
        patch=new_version_number.patch,
    )
if type == 'automation':
    new_version_format = semver.format_version(
        major=new_version_number.major,
        minor=new_version_number.minor,
        patch=new_version_number.patch,
        build=CI_PIPELINE_ID
    )

    formatted_version = semver.format_version(
        major=new_version_number.major,
        minor=new_version_number.minor,
        patch=new_version_number.patch,
        build=CI_PIPELINE_ID
    )

if stage == 'dev':
    if type == 'npm':
        data['version'] = formatted_version
        with open(pathVersion, 'w') as file:
            json.dump(data, file, indent=2)
    elif type == 'koni' or type == 'automation':
        update_keyProperties(pathVersion,new_version_format,new_android_version if type != 'automation' else None)
    else:
        current_version.text = formatted_version
        tree.write(pathVersion, pretty_print=True, xml_declaration=True, encoding="UTF-8")

    print(f'Nueva versión: {formatted_version}')

    tag_name = formatted_version if type != 'automation' else f'{formatted_version}_{name_app}-{version_app}'
    commit_id = last_commit.hexsha
    tag_message = f'Esta es la version {formatted_version}' if type != 'automation' else f'Esta es la version {formatted_version} - {name_app}({version_app})'

    if version_number in repo.tags:
        repo.delete_tag(version_number)

    repo.create_tag(tag_name, ref=commit_id, message=tag_message, force=True)
    repo.create_tag(version_number, ref=commit_id, message=tag_message)

    remote.push(tag_name)
    remote.push(version_number)

    # build_and_render(
    #     repository=".",
    #     output="CHANGELOG.md",
    #     convention="angular",
    #     template="keepachangelog",
    #     parse_trailers=True,
    #     parse_refs=False,
    #     sections=("build", "deps", "feat", "fix", "refactor", "docs", "perf", "revert"),
    #     bump_latest=True,
    #     in_place=True,
    # )

    repo.git.add('--all')
    commit_message = 'ci: Version updated to {} [skip ci]'.format(new_version_format)
    repo.index.commit(commit_message)
    remote.push()

print(f'Nueva versión sin prerelease: {formatted_version}')
print(f'Nueva versión: {new_version_format}')

if type == 'npm' or type == 'maven' or type == 'dotnet' or type == 'automation':
    buildTarget= formatted_version.replace("+","-")
    subprocess.run(["echo", "##vso[build.updatebuildnumber]{}".format(buildTarget)])
    with open('build.env', 'a') as file:
        file.write("{}".format(buildTarget))