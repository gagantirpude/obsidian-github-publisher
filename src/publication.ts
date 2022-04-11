//Credit : https://github.com/oleeskild/obsidian-digital-garden @oleeskild

import {MetadataCache, Vault, TFile, Notice } from 'obsidian';
import {
	mkdocsPublicationSettings,
} from "./settings";
import { Octokit } from "@octokit/core";
import {Base64} from "js-base64";
import {arrayBufferToBase64} from "./utils";

export interface IMkdocsPublish {
	publish(file:TFile): any,
	getSharedFile(): any,
	getLinkedImage(file:TFile): any,
}

export default class MkdocsPublish {
	vault: Vault;
	metadataCache: MetadataCache;
	settings: mkdocsPublicationSettings;

	constructor(vault: Vault, metadataCache: MetadataCache, settings: mkdocsPublicationSettings) {
		this.vault = vault;
		this.metadataCache = metadataCache;
		this.settings = settings;
	}

	async getSharedFiles() {
		const files = this.vault.getMarkdownFiles();
		const shared_File = [];
		const sharedkey = this.settings.shareKey;
		for (const file of files) {
			try {
				const frontMatter = this.metadataCache.getCache(file.path).frontmatter;
				if (frontMatter && frontMatter[sharedkey] === true) {
					shared_File.push(file);
				}
			} catch {
				//ignore
			}
		}
		return shared_File;
	}

	getLinkedImage(file: TFile) {
		const embed_files = app.metadataCache.getCache(file.path).embeds;
		let image_list = [];
		if (embed_files != undefined) {
			for (const embed_file of embed_files) {
				if (embed_file.link.endsWith(".png") || embed_file.link.endsWith(".jpg") || embed_file.link.endsWith(".jpeg") || embed_file.link.endsWith(".gif") || embed_file.link.endsWith(".svg") || embed_file.link.endsWith(".bmp")) {
					image_list.push(embed_file.link);
				}
			}
			return image_list;
		}
		return [];
	}

	checkExcludedFolder(file: TFile) {
		const excluded_folder = this.settings.ExcludedFolder.split("/");
		for (let i = 0; i < excluded_folder.length; i++) {
			if (file.path.contains(excluded_folder[i].trim())) {
				return true;
			}
		}
		return false;
	}


	async publish(file: TFile, one_file: boolean = false) {
		const sharedkey = this.settings.shareKey;
		const frontmatter = this.metadataCache.getCache(file.path).frontmatter;
		 this.checkExcludedFolder(file)
		if (!frontmatter || !frontmatter[sharedkey] || this.checkExcludedFolder(file)) {
			return false;
		}
		try {
			const text = await this.vault.cachedRead(file);
			const linked_image = this.getLinkedImage(file);
			await this.uploadText(file.path, text);
			if (linked_image.length > 0) {
				for (const image of linked_image) {
					await this.uploadImage(image);
				}
			}
			if (one_file) {
				await this.uploadFolder();
			}
			return true;
		} catch {
			return false;
		}
	}

	async uploadFolder(){
		console.log("hello")
		const folder = await this.getSharedFiles();
		if (folder.length > 0) {
			const publishedFiles = folder.map(file => file.name);
			const publishedFilesText = publishedFiles.toString();
			await this.uploadText('vault_published.txt', publishedFilesText);
		}
	}

	async upload(filePath: string, content: string) {
		if (!this.settings.githubRepo) {
			new Notice("Config error : You need to define a github repo in the plugin settings");
			throw {};
		}
		if (!this.settings.githubName) {
			new Notice("Config error : You need to define your github username in the plugin settings");
			throw {};
		}
		const octokit = new Octokit({
			auth: this.settings.GhToken
		});
		const pathLib = require('path')
		const path = `source/${pathLib.basename(filePath)}`;
		const payload = {
			owner: this.settings.githubName,
			repo: this.settings.githubRepo,
			path,
			message: `Adding ${pathLib.basename(filePath)}`,
			content: content,
			sha: '',
		};
		try {
			const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
				owner: this.settings.githubName,
				repo: this.settings.githubRepo,
				path
			});
			// @ts-ignore
			if (response.status === 200 && response.data.type === "file") {
				// @ts-ignore
				payload.sha = response.data.sha;

			}
		} catch (e) {
			console.log(e)
		}
		payload.message = `Update note ${pathLib.basename(filePath)}`;
		await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', payload);
	}

	async uploadImage(filePath: string) {
		const imageTFile = await this.vault.getAbstractFileByPath(filePath) as TFile;
		const imageBin = await this.vault.readBinary(imageTFile);
		const image64 = arrayBufferToBase64(imageBin);
		await this.upload(filePath, image64);

	}

	async uploadText(filePath: string, text: string) {
		const contentBase64 = Base64.encode(text);
		await this.upload(filePath, contentBase64);
	}
}
